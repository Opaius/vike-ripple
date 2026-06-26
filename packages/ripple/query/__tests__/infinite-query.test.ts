import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInfiniteQuery } from '../src/infinite-query.ts';

describe('createInfiniteQuery', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('fetches first page and detects hasNextPage', async () => {
		const fetcher = vi.fn(async () =>
			Array.from({ length: 21 }, (_, i) => ({ id: i + 1 }))
		);
		const q = createInfiniteQuery({ fetcher, pageSize: 20 });
		await q.fetchNextPage();
		expect(q.data.value).toHaveLength(20);
		expect(q.hasNextPage.value).toBe(true);
	});

	it('detects last page when exactly pageSize items returned', async () => {
		const fetcher = vi.fn(async () =>
			Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))
		);
		const q = createInfiniteQuery({ fetcher, pageSize: 20 });
		await q.fetchNextPage();
		expect(q.data.value).toHaveLength(20);
		expect(q.hasNextPage.value).toBe(false);
	});

	it('guard: fetchNextPage is no-op while already fetching', async () => {
		let resolveFetch: () => void;
		const fetchPromise = new Promise<void>((r) => {
			resolveFetch = r;
		});
		const fetcher = vi.fn(async () => {
			await fetchPromise;
			return Array.from({ length: 21 }, (_, i) => ({ id: i + 1 }));
		});
		const q = createInfiniteQuery({ fetcher, pageSize: 20 });

		const firstCall = q.fetchNextPage();
		const secondCall = q.fetchNextPage();

		resolveFetch!();
		await Promise.all([firstCall, secondCall]);

		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('guard: fetchNextPage is no-op when hasNextPage is false', async () => {
		const fetcher = vi.fn(async () =>
			Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))
		);
		const q = createInfiniteQuery({ fetcher, pageSize: 20 });
		await q.fetchNextPage();
		expect(q.hasNextPage.value).toBe(false);

		await q.fetchNextPage();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('advances cursor between pages using default id-based cursor', async () => {
		const items1 = Array.from({ length: 21 }, (_, i) => ({ id: i + 1 }));
		const items2 = Array.from({ length: 21 }, (_, i) => ({ id: i + 22 }));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(items1)
			.mockResolvedValueOnce(items2);

		const q = createInfiniteQuery({ fetcher, pageSize: 20 });
		await q.fetchNextPage();
		expect(q.data.value).toHaveLength(20);
		expect(fetcher).toHaveBeenCalledWith(null, 21);

		// second call should pass cursor from last item's id (20)
		await q.fetchNextPage();
		expect(fetcher).toHaveBeenCalledWith(20, 21);
		expect(q.data.value).toHaveLength(40);
	});

	it('reset clears data and cursor, allows refetch from start', async () => {
		const items1 = Array.from({ length: 21 }, (_, i) => ({ id: i + 1 }));
		const items2 = Array.from({ length: 21 }, (_, i) => ({ id: i + 22 }));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(items1)
			.mockResolvedValueOnce(items2)
			.mockResolvedValueOnce(
				Array.from({ length: 10 }, (_, i) => ({ id: i + 50 }))
			);

		const q = createInfiniteQuery({ fetcher, pageSize: 20 });
		await q.fetchNextPage();
		await q.fetchNextPage();
		expect(q.data.value).toHaveLength(40);

		q.reset();
		expect(q.data.value).toEqual([]);
		expect(q.hasNextPage.value).toBe(true);

		await q.fetchNextPage();
		expect(fetcher).toHaveBeenLastCalledWith(null, 21);
		expect(q.data.value).toHaveLength(10);
		expect(q.hasNextPage.value).toBe(false);
	});

	it('sets error signal when fetcher rejects and calls onError', async () => {
		const testError = new Error('Network error');
		const onError = vi.fn();
		const fetcher = vi.fn(async () => {
			throw testError;
		});

		const q = createInfiniteQuery({ fetcher, pageSize: 20, onError });
		await q.fetchNextPage();

		expect(q.error.value).toBe(testError);
		expect(q.isFetchingNextPage.value).toBe(false);
		expect(onError).toHaveBeenCalledWith(testError);
	});

	it('uses custom getCursor to extract cursor from items', async () => {
		const items1 = Array.from({ length: 21 }, (_, i) => ({
			uuid: `uuid-${i + 1}`
		}));
		const items2 = Array.from({ length: 10 }, (_, i) => ({
			uuid: `uuid-${i + 21}`
		}));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(items1)
			.mockResolvedValueOnce(items2);

		const q = createInfiniteQuery({
			fetcher,
			pageSize: 20,
			getCursor: (item) => item.uuid
		});

		await q.fetchNextPage();
		expect(fetcher).toHaveBeenCalledWith(null, 21);

		await q.fetchNextPage();
		expect(fetcher).toHaveBeenCalledWith('uuid-20', 21);
	});
});
