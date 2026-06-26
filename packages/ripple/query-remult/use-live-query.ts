import type { Tracked } from 'ripple';
import { effect, track } from 'ripple';
import { entityKey, registerInvalidator } from './src/index';

/**
 * The subset of Remult's Repository<T> that useLiveQuery calls.
 * Defined inline because Repository<T>.liveQuery.subscribe has
 * overloads that make the full type clash.
 */
interface LiveQueryRepo<T> {
	metadata: { key: string };
	find(params?: Record<string, unknown>): Promise<T[]>;
	liveQuery(params?: Record<string, unknown>): {
		subscribe(
			cb: (info: {
				items: T[];
				changes: unknown[];
				applyChanges: (prev: T[]) => T[];
			}) => void
		): () => void;
	};
}

export interface UseLiveQueryResult<T> {
	data: Tracked<T[]>;
	isLoading: Tracked<boolean>;
	error: Tracked<Error | undefined>;
}

// ponytail: LiveQueryRepo<T> defined above instead of `any`.
// Remult's Repository<T>.liveQuery.subscribe has overloads that
// clash with a generic — inline interface avoids the issue.
export function useLiveQuery<T>(
	repo: LiveQueryRepo<T>,
	params?: Record<string, unknown>,
	options?: { key?: string }
): UseLiveQueryResult<T> {
	const items = track([] as T[]);
	const isLoading = track(true);
	const error = track<Error | undefined>(undefined);

	// Client: subscribe to SSE-driven live query with auto-cleanup
	if (typeof window !== 'undefined') {
		const key = options?.key || entityKey(repo);
		const live = repo.liveQuery(params);
		const unsub = live.subscribe(
			(info: {
				items: T[];
				changes: unknown[];
				applyChanges: (prev: T[]) => T[];
			}) => {
				try {
					items.value = info.applyChanges(items.value) as T[];
					isLoading.value = false;
				} catch (e) {
					error.value = e instanceof Error ? e : new Error(String(e));
				}
			}
		);
		const invCleanup = registerInvalidator(key, () => {
			repo
				.find(params)
				.then((fetched: T[]) => {
					items.value = fetched;
				})
				.catch(() => {});
		});
		// cleanup runs on block disposal (component unmount, page nav)
		effect(() => () => {
			unsub();
			invCleanup();
		});
	} else {
		// SSR: one-time fetch, hydrate initial data
		repo
			.find(params)
			.then((fetched: T[]) => {
				items.value = fetched;
				isLoading.value = false;
			})
			.catch((e: unknown) => {
				error.value = e instanceof Error ? e : new Error(String(e));
				isLoading.value = false;
			});
	}

	return { data: items, isLoading, error };
}
