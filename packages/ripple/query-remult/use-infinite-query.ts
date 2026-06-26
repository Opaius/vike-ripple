import type { Tracked } from 'ripple';
import { track, trackAsync } from 'ripple';
import {
	createInfiniteRemultQuery,
	entityKey,
	type InfiniteRemultQueryConfig,
	type Repo,
	registerInvalidator
} from './src/index';

export interface UseInfiniteQueryResult<T> {
	data: Tracked<T[]>;
	isLoading: Tracked<boolean>;
	error: Tracked<Error | undefined>;
	hasNextPage: Tracked<boolean>;
	isFetchingNextPage: Tracked<boolean>;
	fetchNextPage: () => Promise<void>;
	invalidate: () => void;
}

export function useInfiniteQuery<T>(
	repo: Repo<T>,
	options?: InfiniteRemultQueryConfig & { key?: string }
): UseInfiniteQueryResult<T> {
	const isLoading = track(true);
	const error = track<Error | undefined>(undefined);
	const key = options?.key || entityKey(repo);

	const result = createInfiniteRemultQuery(repo, options);

	registerInvalidator(key, () => {
		result.reset();
		isLoading.value = true;
	});

	const data = trackAsync(async () => {
		isLoading.value = true;
		error.value = undefined;
		try {
			return await result.fetcher();
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			error.value = err;
			throw err;
		} finally {
			isLoading.value = false;
		}
	});

	return {
		data,
		isLoading,
		error,
		hasNextPage: result.hasNextPage,
		isFetchingNextPage: result.isFetchingNextPage,
		fetchNextPage: result.fetchNextPage,
		invalidate: () => {
			result.reset();
			isLoading.value = true;
		}
	};
}
