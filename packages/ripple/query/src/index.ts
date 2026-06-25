import { track, effect } from 'ripple';
import type { Tracked } from 'ripple';

// ── Public Types ──────────────────────────────────────────

/** Serializable tuple identifying a cache entry. */
export type QueryKey = (
	| string
	| number
	| boolean
	| Record<string, unknown>
	| null
	| undefined
)[];

/** Reactive status companion returned by `query()`. */
export interface QueryInfo {
	status: Tracked<'pending' | 'success' | 'error'>;
	error: Tracked<Error | undefined>;
}

export interface QueryOptions {
	/** Time in ms before data is considered stale (default: 0 — always fresh). */
	staleTime?: number;
	/** Time in ms before unused cache entry is garbage-collected (default: 5 min). */
	gcTime?: number;
}

// ── Internal Types ────────────────────────────────────────

/** @internal Cache entry for a single query key. */
export interface QueryEntry<T = unknown> {
	version: Tracked<number>;
	data: Tracked<T | undefined>;
	status: Tracked<'pending' | 'success' | 'error'>;
	error: Tracked<Error | undefined>;
	subscribers: number;
	gcTimer: ReturnType<typeof setTimeout> | null;
	lastFetch: number;
	staleTime: number;
	gcTime: number;
	fetcher: (() => Promise<T>) | null;
}

const cache = new Map<string, QueryEntry>();

// ── Key Serialization ─────────────────────────────────────

function serializeKey(key: QueryKey): string {
	return JSON.stringify(key, (_, v) => {
		if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
			return Object.keys(v)
				.sort()
				.reduce<Record<string, unknown>>((acc, k) => {
					acc[k] = (v as Record<string, unknown>)[k];
					return acc;
				}, {});
		}
		return v;
	});
}

// ── Fetch ─────────────────────────────────────────────────

async function fetchEntry<T>(
	entry: QueryEntry<T>,
	fetcher: () => Promise<T>,
): Promise<void> {
	entry.status.value = 'pending';
	try {
		const result = await fetcher();
		entry.data.value = result;
		entry.status.value = 'success';
		entry.error.value = undefined;
		entry.lastFetch = Date.now();
	} catch (e: unknown) {
		entry.error.value = e instanceof Error ? e : new Error(String(e));
		entry.status.value = 'error';
	}
}

// ── Public API ────────────────────────────────────────────

/**
 * Create or retrieve a cached query signal.
 *
 * ```ts
 * const [data, info] = query(['todos', { done: true }], () => fetchTodos())
 * ```
 *
 * The returned `data` signal auto-refetches when the entry is invalidated
 * via `invalidateKeys()` or `invalidateAll()`.
 */
export function query<T>(
	key: QueryKey,
	fetcher: () => Promise<T>,
	options: QueryOptions = {},
): [Tracked<T | undefined>, QueryInfo] {
	const k = serializeKey(key);
	let entry = cache.get(k) as QueryEntry<T> | undefined;

	if (!entry) {
		entry = {
			version: track(0),
			data: track<T | undefined>(undefined),
			status: track<'pending' | 'success' | 'error'>('pending'),
			error: track<Error | undefined>(undefined),
			subscribers: 0,
			gcTimer: null,
			lastFetch: 0,
			staleTime: options.staleTime ?? 0,
			gcTime: options.gcTime ?? 5 * 60 * 1000,
			fetcher,
		};
		cache.set(k, entry);

		// First creation: start fetch + wire up reactive refetch
		queueMicrotask(() => fetchEntry(entry, fetcher));

		// Use Ripple effect to re-fetch when version bumps (invalidation)
		effect(() => {
			entry!.version.value; // subscribe to version changes
			fetchEntry(entry!, entry!.fetcher ?? fetcher);
		});
	} else {
		entry.fetcher ??= fetcher;
	}

	// Subscribe — cancel any pending GC
	entry.subscribers++;
	clearTimeout(entry.gcTimer);
	entry.gcTimer = null;

	// Stale check — bump version to trigger refetch via effect
	if (
		entry.lastFetch > 0 &&
		Date.now() - entry.lastFetch > entry.staleTime
	) {
		entry.version.value += 1;
	}

	return [entry.data, { status: entry.status, error: entry.error }];
}

/**
 * Decrement subscriber count. When count reaches zero, start the GC timer.
 * Call this in a Ripple block's cleanup.
 */
export function unsubscribe(key: QueryKey): void {
	const k = serializeKey(key);
	const entry = cache.get(k);
	if (!entry) return;

	entry.subscribers--;
	if (entry.subscribers <= 0) {
		entry.subscribers = 0;
		clearTimeout(entry.gcTimer);
		entry.gcTimer = setTimeout(() => {
			cache.delete(k);
		}, entry.gcTime);
	}
}

/**
 * Invalidate all cache entries whose serialized key starts with the
 * given prefix.
 *
 * Bumps each matching entry's `version` signal — the `effect()` watcher
 * picks it up and re-fetches automatically.
 *
 * ```ts
 * invalidateKeys(['todos'])         // invalidates ['todos'], ['todos', { done: true }]
 * invalidateKeys(['Task', 'find'])  // invalidates all Task finds
 * ```
 */
export function invalidateKeys(prefix: QueryKey): void {
	const p = serializeKey(prefix);
	for (const [k, entry] of cache) {
		if (k.startsWith(p)) {
			entry.version.value += 1;
		}
	}
}

/** Invalidate every cached entry. */
export function invalidateAll(): void {
	for (const entry of cache.values()) {
		entry.version.value += 1;
	}
}

/** Low-level access to the cache map (debugging / SSR serialization). */
export function getQueryCache(): Map<string, QueryEntry> {
	return cache;
}

// ── SSR: Serialize → Hydrate ──────────────────────────────

const SSR_ID = '__rq_cache';

/**
 * Serialize cache entries into a `<script>` tag for SSR.
 * Embed this in your HTML head (e.g. in `onRenderHtml`).
 */
export function serializeCache(): string {
	const entries: Array<{ key: string; data: unknown }> = [];
	for (const [key, entry] of cache) {
		if (entry.status.value === 'success' && entry.data.value !== undefined) {
			entries.push({ key, data: entry.data.value });
		}
	}
	return `<script id="${SSR_ID}" type="application/json">${JSON.stringify(
		entries,
	)}</script>`;
}

/**
 * Hydrate cache from serialized SSR data.
 * Call once on the client before the first render.
 */
export function hydrateCache(): void {
	const el = document.getElementById(SSR_ID);
	if (!el) return;
	try {
		const entries: Array<{ key: string; data: unknown }> = JSON.parse(
			el.textContent ?? '[]',
		);
		for (const { key, data } of entries) {
			const existing = cache.get(key);
			if (existing) {
				existing.data.value = data as never;
				existing.status.value = 'success';
				existing.lastFetch = Date.now();
			} else {
				const entry: QueryEntry = {
					version: track(0),
					data: track(data),
					status: track<'pending' | 'success' | 'error'>('success'),
					error: track<Error | undefined>(undefined),
					subscribers: 0,
					gcTimer: null,
					lastFetch: Date.now(),
					staleTime: 0,
					gcTime: 5 * 60 * 1000,
					fetcher: null,
				};
				cache.set(key, entry);
			}
		}
		el.remove();
	} catch {
		// Malformed cache — skip silently
	}
}
