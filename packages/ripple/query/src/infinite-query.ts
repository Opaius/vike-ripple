import { type Tracked, track } from 'ripple';

export interface InfiniteQueryConfig<T> {
	/** Page size — passed to the fetcher as `limit`. Default 20. */
	pageSize?: number;
	/** The fetcher receives a cursor (null on first page) and limit, returns a page of items. */
	fetcher: (cursor: string | number | null, limit: number) => Promise<T[]>;
	/** Extract the cursor from the last item of a page. Default: `(item) => item.id`. */
	getCursor?: (item: T) => string | number;
	/** Called when a page fetch errors — default: sets error signal. */
	onError?: (error: Error) => void;
}

export interface InfiniteQueryResult<T> {
	/** Tracked array of all accumulated items across fetched pages. */
	data: Tracked<T[]>;
	/** Tracked: true if more pages may be available. */
	hasNextPage: Tracked<boolean>;
	/** Tracked: true while fetching the next page. */
	isFetchingNextPage: Tracked<boolean>;
	/** Tracked: error from the last failed fetch, or undefined. */
	error: Tracked<Error | undefined>;
	/** Fetch the next page. No-op if already fetching or no next page. */
	fetchNextPage: () => Promise<void>;
	/** Reset to initial state (clears all items, resets cursor). */
	reset: () => void;
}

export function createInfiniteQuery<T>(
	config: InfiniteQueryConfig<T>
): InfiniteQueryResult<T> {
	const pageSize = config.pageSize ?? 20;
	const getCursor =
		config.getCursor ??
		((item: T) => {
			// ponytail: default cursor extraction — assumes an `id` field on items.
			const record = item as unknown as { id: string | number };
			return record.id;
		});

	const data = track<T[]>([]);
	const hasNextPage = track(true);
	const isFetchingNextPage = track(false);
	const error = track<Error | undefined>(undefined);

	let cursor: string | number | null = null;

	async function fetchNextPage(): Promise<void> {
		if (isFetchingNextPage.value || !hasNextPage.value) return;
		isFetchingNextPage.value = true;
		error.value = undefined;
		try {
			const items = await config.fetcher(cursor, pageSize + 1);
			const hasMore = items.length > pageSize;
			const pageItems = hasMore ? items.slice(0, pageSize) : items;
			if (pageItems.length > 0) {
				cursor = getCursor(pageItems[pageItems.length - 1]);
			}
			hasNextPage.value = hasMore;
			data.value = [...data.value, ...pageItems];
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			error.value = err;
			config.onError?.(err);
		} finally {
			isFetchingNextPage.value = false;
		}
	}

	function reset(): void {
		data.value = [];
		cursor = null;
		hasNextPage.value = true;
		isFetchingNextPage.value = false;
		error.value = undefined;
	}

	return {
		data,
		hasNextPage,
		isFetchingNextPage,
		error,
		fetchNextPage,
		reset
	};
}
