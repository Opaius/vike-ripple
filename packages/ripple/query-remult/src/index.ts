/**
 * @cioky/ripple-query-remult — Remult adapter for @cioky/ripple-query.
 */

import {
	getQueryCache,
	type QueryKey,
	invalidateAll as rqInvalidateAll,
	invalidateKeys as rqInvalidateKeys
} from '@cioky/ripple-query';
import type { Tracked } from 'ripple';
import { track } from 'ripple';

export interface Repo<T> {
	metadata: { key: string };
	find(options?: Record<string, unknown>): Promise<T[]>;
	findFirst(options?: Record<string, unknown>): Promise<T | undefined>;
	count(options?: Record<string, unknown>): Promise<number>;
	toJson(item: T | T[]): unknown;
}
export interface RemultQueryOptions {
	liveQuery?: boolean;
	/** @internal — version Tracked from useQuery for cache invalidation. */
	version?: Tracked<number>;
}

export interface RemultQueryResult<T> {
	fetcher: () => Promise<T>;
	invalidate: () => void;
	/** The version Tracked — pass to mutation for auto-invalidation */
	version?: Tracked<number>;
}

export interface InfiniteRemultQueryConfig {
	pageSize?: number;
	orderBy?: Record<string, unknown>;
	where?: Record<string, unknown>;
	cursorField?: string;
}

export interface InfiniteRemultQueryResult<T> {
	fetcher: () => Promise<T[]>;
	fetchNextPage: () => Promise<void>;
	hasNextPage: Tracked<boolean>;
	isFetchingNextPage: Tracked<boolean>;
	error: Tracked<Error | undefined>;
	reset: () => void;
}

export function entityKey(repo: Repo<unknown>): string {
	const meta = repo.metadata as { key: string } | undefined;
	return meta?.key ?? 'unknown';
}

export function invalidateKeys(prefix: QueryKey): void {
	rqInvalidateKeys(prefix);
}

export function invalidateAll(): void {
	rqInvalidateAll();
}

export function invalidateEntity(entityKey: string): void;
export function invalidateEntity(entityKey: string, method: string): void;
export function invalidateEntity(
	entityKey: string,
	method: string,
	params?: Record<string, unknown>
): void;
export function invalidateEntity(
	entityKey: string,
	method?: string,
	params?: Record<string, unknown>
): void {
	const prefix: QueryKey = [entityKey];
	if (method) prefix.push(method);
	if (params && Object.keys(params).length > 0) {
		prefix.push({ ...params } as Record<string, unknown>);
	}
	invalidateKeys(prefix);
}
// ── Invalidator Registry ──────────────────────────────────
// Queries register their invalidate() function by entity key.
// Mutations call triggerInvalidators(key) on success → all matching queries refetch.
const invalidatorMap = new Map<string, Set<() => void>>();

export function registerInvalidator(key: string, fn: () => void): () => void {
	if (!invalidatorMap.has(key)) invalidatorMap.set(key, new Set());
	invalidatorMap.get(key)!.add(fn);
	return () => invalidatorMap.get(key)?.delete(fn);
}

export function triggerInvalidators(key: string): void {
	invalidatorMap.get(key)?.forEach((fn) => {
		fn();
	});
}

export function unregisterInvalidator(key: string, fn: () => void): void {
	invalidatorMap.get(key)?.delete(fn);
}

export function buildKey<T>(
	repo: Repo<T>,
	method: string,
	params?: Record<string, unknown>
): QueryKey {
	const base = [entityKey(repo), method] as QueryKey;
	if (params && Object.keys(params).length > 0) {
		base.push({ ...params } as Record<string, unknown>);
	}
	return base;
}

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: 'find',
	params?: Record<string, unknown>,
	options?: RemultQueryOptions
): RemultQueryResult<T[]>;

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: 'findFirst',
	params?: Record<string, unknown>,
	options?: RemultQueryOptions
): RemultQueryResult<T | undefined>;

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: 'count',
	params?: Record<string, unknown>,
	options?: RemultQueryOptions
): RemultQueryResult<number>;

export function createRemultQuery<T>(
	repo: Repo<T>,
	method: string,
	params?: Record<string, unknown>,
	options?: RemultQueryOptions
): RemultQueryResult<unknown> {
	const key = buildKey(repo, method, params);
	const k = JSON.stringify(key);
	const fetcher = async (): Promise<unknown> => {
		if (options?.version) options.version.value;
		// ponytail: skip cache on server — each SSR request fetches fresh data
		if (typeof window !== 'undefined') {
			const existing = getQueryCache().get(k);
			if (
				existing &&
				existing.status.value === 'success' &&
				existing.data.value !== undefined
			) {
				return existing.data.value;
			}
		}

		let result: unknown;
		switch (method) {
			case 'find':
				result = await repo.find(params);
				result = repo.toJson(result as T[]);
				break;
			case 'findFirst':
				result = await repo.findFirst(params);
				result = result !== undefined ? repo.toJson(result as T) : undefined;
				break;
			case 'count':
				result = await repo.count(params);
				break;
			default:
				throw new Error(`Unknown Remult method: ${method}`);
		}

		// Still populate cache on server so serializeCache() can send to client
		if (!getQueryCache().has(k)) {
			getQueryCache().set(k, {
				version: track(0),
				data: track(result),
				status: track<'pending' | 'success' | 'error'>('success'),
				error: track<Error | undefined>(undefined),
				subscribers: 0,
				gcTimer: null,
				lastFetch: Date.now(),
				staleTime: 0,
				gcTime: 5 * 60 * 1000,
				fetcher: null
			} as never);
		}

		if (options?.liveQuery) subscribeEntity(entityKey(repo));

		return result;
	};

	return {
		fetcher,
		version: options?.version,
		invalidate: () => {
			getQueryCache().delete(k);
			if (options?.version) options.version.value += 1;
		}
	};
}

export function createInfiniteRemultQuery<T>(
	repo: Repo<T>,
	options: InfiniteRemultQueryConfig = {}
): InfiniteRemultQueryResult<T> {
	const pageSize = options.pageSize ?? 20;
	// Detect cursor field from orderBy if not explicitly set
	const orderByKeys = options.orderBy ? Object.keys(options.orderBy) : [];
	const cursorField = options.cursorField ?? orderByKeys[0] ?? 'id';
	const sortDir =
		orderByKeys.length > 0
			? (options.orderBy as Record<string, unknown>)[orderByKeys[0]]
			: undefined;
	const cursorOp = sortDir === 'desc' ? '$lt' : '$gt';

	const hasNextPage = track(true);
	const isFetchingNextPage = track(false);
	const error = track<Error | undefined>(undefined);
	const pageVersion = track(0);

	let allItems: T[] = [];
	let cursor: string | number | null = null;

	function buildParams(): Record<string, unknown> {
		const params: Record<string, unknown> = { limit: pageSize + 1 };
		if (options.orderBy || options.where) {
			const mergedWhere: Record<string, unknown> = {};
			if (options.where) Object.assign(mergedWhere, options.where);
			if (cursor != null)
				mergedWhere[cursorField] = { [cursorOp]: cursor } as Record<
					string,
					unknown
				>;
			(params as any).where = mergedWhere;
			if (options.orderBy) (params as any).orderBy = options.orderBy;
		}
		return params;
	}

	async function fetchPage(): Promise<void> {
		isFetchingNextPage.value = true;
		error.value = undefined;
		try {
			const params = buildParams();
			const items = await repo.find(params);
			const hasMoreItems = items.length > pageSize;
			const pageItems = hasMoreItems ? items.slice(0, pageSize) : items;
			const json = repo.toJson(pageItems as T[]) as T[];
			if (pageItems.length > 0) {
				const last = pageItems[pageItems.length - 1] as any;
				cursor = last[cursorField];
			}
			hasNextPage.value = hasMoreItems;
			allItems.push(...json);
		} catch (e) {
			error.value = e instanceof Error ? e : new Error(String(e));
		} finally {
			isFetchingNextPage.value = false;
		}
	}

	async function fetcher(): Promise<T[]> {
		hasNextPage.value;
		pageVersion.value;
		if (allItems.length === 0 && hasNextPage.value) {
			await fetchPage();
			pageVersion.value += 1;
		}
		return [...allItems];
	}

	async function fetchNextPage(): Promise<void> {
		if (isFetchingNextPage.value || !hasNextPage.value) return;
		await fetchPage();
		pageVersion.value += 1;
	}
	function reset(): void {
		allItems = [];
		cursor = null;
		hasNextPage.value = true;
		pageVersion.value += 1;
	}

	return {
		fetcher,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		error,
		reset
	};
}

const subscribedEntities = new Set<string>();

export function subscribeEntity(entityName: string): void {
	if (subscribedEntities.has(entityName)) return;
	subscribedEntities.add(entityName);
}

export type { QueryInfo, QueryKey } from '@cioky/ripple-query';

// ── mutation ──────────────────────────────────────────────

export interface MutationResult<TData = unknown> {
	mutate: (...args: any[]) => Promise<TData>;
	isLoading: Tracked<boolean>;
	error: Tracked<Error | undefined>;
}

export interface MutationOptions {
	/** Query keys to invalidate on success. Defaults to the entity key. */
	invalidates?: string | string[];
	/** Legacy: called after mutation success, cache clear, and triggerInvalidators. */
	onInvalidate?: () => void;
}
export function mutation<T>(
	repo: Repo<T>,
	method: 'insert' | 'update' | 'delete' | 'save',
	options: MutationOptions = {}
): MutationResult<T> {
	const entityK = entityKey(repo);
	const invalidKeys = options.invalidates
		? Array.isArray(options.invalidates)
			? options.invalidates
			: [options.invalidates]
		: [entityK];
	const isLoading = track(false);
	const error = track<Error | undefined>(undefined);

	async function mutate(...args: any[]): Promise<T> {
		isLoading.value = true;
		error.value = undefined;

		const r = repo as any;
		try {
			let result: T;
			switch (method) {
				case 'insert':
					result = await r.insert(args[0]);
					break;
				case 'update':
					result = await r.update(args[0], args[1]);
					break;
				case 'delete':
					result = await r.delete(args[0]);
					break;
				case 'save':
					result = await r.save(args[0]);
					break;
				default:
					throw new Error(`Unknown mutation method: ${method}`);
			}
			invalidKeys.forEach((k) => {
				triggerInvalidators(k);
			});
			options?.onInvalidate?.();
			return result;
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			error.value = err;
			throw err;
		} finally {
			isLoading.value = false;
		}
	}

	return { mutate, isLoading, error };
}
