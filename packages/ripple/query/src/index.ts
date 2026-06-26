import { track } from 'ripple';
import type { Tracked } from 'ripple';

// ── Public Types ──────────────────────────────────────────

export type QueryKey = (
	| string
	| number
	| boolean
	| Record<string, unknown>
	| null
	| undefined
)[];

export interface QueryInfo {
	status: Tracked<'pending' | 'success' | 'error'>;
	error: Tracked<Error | undefined>;
}

export interface QueryOptions {
	staleTime?: number;
	gcTime?: number;
}

// ── Internal Types ────────────────────────────────────────

interface QueryEntry<T = unknown> {
	data: Tracked<T | undefined>;
	version: Tracked<number>;
	status: Tracked<'pending' | 'success' | 'error'>;
	error: Tracked<Error | undefined>;
	subscribers: number;
	gcTimer: any;
	lastFetch: number;
	staleTime: number;
	gcTime: number;
	fetcher: (() => Promise<T>) | null;
}

// ── Per-request Cache ─────────────────────────────────────
// Server: the integration (onRenderHtml) sets up an AsyncLocalStorage
//   and runs each SSR request in `als.run(new Map(), ...)`.
//   getQueryCache() reads from ALS → request-scoped → no cross-contamination.
// Client: no ALS → falls back to a module-level singleton.
//   Single-user per tab — shared cache is correct.

let _fallbackCache = new Map<string, QueryEntry>();

function _getStorage(): any {
	return (globalThis as any).__rq_cache_storage;
}

export function getQueryCache(): Map<string, QueryEntry> {
	const storage = _getStorage();
	if (storage) {
		const store = storage.getStore();
		if (store) return store;
	}
	return _fallbackCache;
}

export function clearCache(): void {
	getQueryCache().clear();
}

// ── Key Serialization ─────────────────────────────────────

function serializeKey(key: QueryKey): string {
	return JSON.stringify(key);
}

function getPending(): Array<Promise<void>> {
	const storage = _getStorage();
	if (storage) {
		const store = storage.getStore();
		if (store instanceof Map) {
			if (!(store as any).__pending) {
				(store as any).__pending = [];
			}
			return (store as any).__pending;
		}
	}
	// Client singleton
	if (!_fallbackPending) _fallbackPending = [];
	return _fallbackPending;
}

let _fallbackPending: Array<Promise<void>> | null = null;

// ── query() ────────────────────────────────────────────────

export function query<T>(
	key: QueryKey,
	fetcher: () => Promise<T>,
	options: QueryOptions = {},
): [Tracked<T | undefined>, QueryInfo] {
	const k = serializeKey(key);
	const cache = getQueryCache();
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
		runFetch(entry, fetcher);
	} else {
		entry.fetcher ??= fetcher;
		// Clear GC timer — a new subscriber is joining
		if (entry.gcTimer) {
			clearTimeout(entry.gcTimer);
			entry.gcTimer = null;
		}
		if (
			entry.lastFetch > 0 &&
			Date.now() - entry.lastFetch > entry.staleTime
		) {
			runFetch(entry, entry.fetcher ?? fetcher);
		}
	}

	entry.subscribers++;

	return [entry.data, { status: entry.status, error: entry.error }];
}
async function runFetch<T>(
	entry: QueryEntry<T>,
	fetcher: () => Promise<T>,
): Promise<void> {
	entry.status.value = 'pending';
	const p = fetcher()
		.then((result) => {
			entry.data.value = result as T;
			entry.status.value = 'success';
			entry.error.value = undefined;
			entry.lastFetch = Date.now();
		})
		.catch((e: unknown) => {
			entry.status.value = 'error';
			entry.error.value = e instanceof Error ? e : new Error(String(e));
		});
	getPending().push(p);
	await p;
}

export async function flushPending(): Promise<void> {
	const p = getPending();
	await Promise.all(p);
	p.length = 0;
}

export function invalidateKeys(prefix: QueryKey): void {
	const p = serializeKey(prefix);
	const cache = getQueryCache();
	for (const [k, entry] of cache) {
		if (k.startsWith(p)) {
			entry.version.value += 1;
			// Do NOT delete entry — active subscribers hold entry.data Tracked.
			// Version bump + runFetch signals them to refetch.
			// GC handles removal when subscribers hit zero.
			if (entry.fetcher) {
				runFetch(entry, entry.fetcher);
			}
		}
	}
}

export function invalidateAll(): void {
	const cache = getQueryCache();
	for (const [, entry] of cache) {
		entry.version.value += 1;
		if (entry.fetcher) {
			runFetch(entry, entry.fetcher);
		}
	}
}
export function unsubscribe(key: QueryKey): void {
	const k = serializeKey(key);
	const cache = getQueryCache();
	const entry = cache.get(k);
	if (!entry) return;

	entry.subscribers--;
	if (entry.subscribers <= 0) {
		entry.subscribers = 0;
		if (entry.gcTimer) clearTimeout(entry.gcTimer);
		entry.gcTimer = setTimeout(() => {
			cache.delete(k);
		}, entry.gcTime);
	}
}


// ── SSR: Serialize → Hydrate ──────────────────────────────

const SSR_ID = '__rq_cache';

export function serializeCache(): string {
	const cache = getQueryCache();
	const entries: Array<{ key: string; data: unknown }> = [];
	for (const [key, entry] of cache) {
		if (entry.status.value === 'success') {
			entries.push({ key, data: entry.data.value });
		}
	}
	return `<script id="${SSR_ID}" type="application/json">${JSON.stringify(entries)}</script>`;
}

export function hydrateCache(): void {
	const el = document.getElementById(SSR_ID);
	if (!el) return;
	const cache = getQueryCache();
	try {
		const entries = JSON.parse(el.textContent || '[]');
		for (const { key, data } of entries) {
			if (!cache.has(key)) {
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
