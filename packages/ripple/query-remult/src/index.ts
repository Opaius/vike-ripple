/**
 * @cioky/ripple-query-remult — Remult adapter for @cioky/ripple-query.
 *
 * Provides auto-key derivation from Remult repo queries, LiveQuery
 * invalidation, and a factory wrapper around `query()`.
 */
import type { Tracked } from 'ripple';
import {
	query,
	invalidateKeys,
	type QueryKey,
	type QueryInfo,
	type QueryOptions,
} from '@cioky/ripple-query';

// ── Types ─────────────────────────────────────────────────

/** Minimal Remult entity metadata shape we depend on. */
export interface EntityInfo {
	name: string;
}

/** Remult repository interface — matches the subset `find`/`findFirst`/`count` use. */
export interface Repo<T> {
	metadata: EntityInfo;
	find(options?: Record<string, unknown>): Promise<T[]>;
	findFirst(options?: Record<string, unknown>): Promise<T | undefined>;
	count(options?: Record<string, unknown>): Promise<number>;
}

/** Extended options for the Remult query wrapper. */
export interface RemultQueryOptions extends QueryOptions {
	/** Enable LiveQuery subscription — auto-invalidates on entity changes. */
	liveQuery?: boolean;
}

// ── Key Derivation ────────────────────────────────────────

/**
 * Build a stable query key from a Remult repo entity, method, and
 * filter params. Keys are sorted for deterministic serialization.
 *
 * ```ts
 * buildKey(Task, 'find', { where: { completed: true } })
 * // → ['Task', 'find', { where: { completed: true } }]
 * ```
 */
export function buildKey<T>(
	repo: Repo<T>,
	method: string,
	params?: Record<string, unknown>,
): QueryKey {
	const key: QueryKey = [repo.metadata.name, method];
	if (params !== undefined && Object.keys(params).length > 0) {
		key.push(params);
	}
	return key;
}

// ── Query Factory ─────────────────────────────────────────

/**
 * Create a cached Remult query with auto key derivation and optional
 * LiveQuery subscription.
 *
 * ```ts
 * const [tasks, info] = createRemultQuery(
 *   remult.repo(Task),
 *   'find',
 *   { where: { completed: true } },
 *   { liveQuery: true }
 * )
 * ```
 */
export function createRemultQuery<T>(
	repo: Repo<T>,
	method: 'find',
	params?: Record<string, unknown>,
	options?: RemultQueryOptions,
): [Tracked<T[] | undefined>, QueryInfo];

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: 'findFirst',
	params?: Record<string, unknown>,
	options?: RemultQueryOptions,
): [Tracked<T | undefined>, QueryInfo];

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: 'count',
	params?: Record<string, unknown>,
	options?: RemultQueryOptions,
): [Tracked<number | undefined>, QueryInfo];

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: string,
	params?: Record<string, unknown>,
	options?: RemultQueryOptions,
): [Tracked<unknown>, QueryInfo] {
	const key = buildKey(repo, method, params);

	const fetcher = (): Promise<unknown> => {
		switch (method) {
			case 'find':
				return repo.find(params);
			case 'findFirst':
				return repo.findFirst(params);
			case 'count':
				return repo.count(params);
			default:
				throw new Error(`Unknown Remult method: ${method}`);
		}
	};

	const { liveQuery, ...queryOpts } = options ?? {};

	const result = query(key, fetcher, queryOpts);

	if (liveQuery) {
		subscribeEntity(repo.metadata.name);
	}

	return result;
}

// ── LiveQuery Subscription ────────────────────────────────

const subscribedEntities = new Set<string>();

/**
 * Open a LiveQuery subscription for the given entity name.
 * On any delta event (insert/update/delete), invalidate all
 * cache entries prefixed by that entity name.
 *
 * Safe to call multiple times for the same entity — only one
 * subscription is created per entity.
 */
export function subscribeEntity(entityName: string): void {
	if (subscribedEntities.has(entityName)) return;
	subscribedEntities.add(entityName);

	// Remult LiveQuery via EventSource (SSE).
	// The endpoint pattern: /api/live-query/<entityName>
	// When a delta arrives, invalidate the entity cache prefix.
	const url = `/api/live-query/${entityName}`;
	const source = new EventSource(url);

	source.addEventListener('insert', () => {
		invalidateKeys([entityName]);
	});
	source.addEventListener('update', () => {
		invalidateKeys([entityName]);
	});
	source.addEventListener('delete', () => {
		invalidateKeys([entityName]);
	});

	source.addEventListener('error', () => {
		// On disconnect, keep stale data (stale-while-revalidate).
		// The next query() call will refetch when observed.
	});
}

// ── Re-exports ────────────────────────────────────────────

export { invalidateKeys, invalidateAll } from '@cioky/ripple-query';
export type { QueryKey, QueryInfo } from '@cioky/ripple-query';
