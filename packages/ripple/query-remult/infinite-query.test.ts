/**
 * Characterization tests for createInfiniteRemultQuery — pure logic, no Ripple runtime needed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInfiniteRemultQuery } from './src/index';
import type { Repo } from './src/index';

// ── Helpers ─────────────────────────────────────────────────

function makeMockRepo<T>(findImpl: (opts: Record<string, unknown>) => Promise<T[]>): Repo<T> {
	return {
		metadata: { key: 'TestEntity' },
		find: findImpl,
		findFirst: async () => undefined,
		count: async () => 0,
		toJson: (x) => x,
	} as Repo<T>;
}

function generateItems(count: number, startId = 1): Array<{ id: number }> {
	return Array.from({ length: count }, (_, i) => ({ id: startId + i }));
}

// ── Tests ───────────────────────────────────────────────────

describe('createInfiniteRemultQuery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('first page with next — returns pageSize items, hasNextPage is true when mock returns pageSize+1', async () => {
		const mockFind = vi.fn(async (_opts: Record<string, unknown>) => generateItems(21));
		const result = createInfiniteRemultQuery(makeMockRepo(mockFind));

		const items = await result.fetcher();

		expect(items).toHaveLength(20);
		expect(result.hasNextPage.value).toBe(true);
		expect(mockFind).toHaveBeenCalledTimes(1);
	});

	it('last page — hasNextPage is false when mock returns exactly pageSize items', async () => {
		const mockFind = vi.fn(async (_opts: Record<string, unknown>) => generateItems(20));
		const result = createInfiniteRemultQuery(makeMockRepo(mockFind));

		const items = await result.fetcher();

		expect(items).toHaveLength(20);
		expect(result.hasNextPage.value).toBe(false);
	});

	it('fetchNextPage — accumulates items, sets isFetchingNextPage during fetch', async () => {
		let callCount = 0;
		const mockFind = vi.fn(async (_opts: Record<string, unknown>) => {
			callCount++;
			// isFetchingNextPage must be true DURING the async find call
			expect(result.isFetchingNextPage.value).toBe(true);
			return callCount === 1 ? generateItems(21) : generateItems(10);
		});
		const result = createInfiniteRemultQuery(makeMockRepo(mockFind));

		// Before any fetch — idle
		expect(result.isFetchingNextPage.value).toBe(false);

		// First page: mock returns 21 → sliced to 20
		await result.fetcher();
		expect(result.isFetchingNextPage.value).toBe(false);
		expect(mockFind).toHaveBeenCalledTimes(1);

		// Second page: mock returns 10
		await result.fetchNextPage();
		expect(result.isFetchingNextPage.value).toBe(false);
		expect(mockFind).toHaveBeenCalledTimes(2);

		// Accumulated: 20 + 10 = 30
		const items = await result.fetcher();
		expect(items).toHaveLength(30);
	});

	it('cursor advance — second find call includes $gt on last id of page 1', async () => {
		let callCount = 0;
		const mockFind = vi.fn(async (opts: Record<string, unknown>) => {
			callCount++;
			if (callCount === 1) {
				// First call: no cursor filter yet
				return generateItems(21); // ids 1‑21
			}
			// Second call: should add $gt on the last id of page 1 (20)
			// `where` is built internally as Record<string, unknown>
			const where = opts.where as Record<string, unknown> | undefined;
			expect(where?.id).toEqual({ $gt: 20 });
			return generateItems(10, 21);
		});
		const result = createInfiniteRemultQuery(makeMockRepo(mockFind), {
			orderBy: { id: 'asc' },
			cursorField: 'id',
		});

		await result.fetcher(); // page 1: items 1‑20, cursor advances to 20
		await result.fetchNextPage(); // page 2: uses cursor $gt:20
		expect(mockFind).toHaveBeenCalledTimes(2);
		expect(await result.fetcher()).toHaveLength(30);
	});

	it('reset — clears items and resets hasNextPage to true', async () => {
		let callCount = 0;
		const mockFind = vi.fn(async (_opts: Record<string, unknown>) => {
			callCount++;
			// First call returns items; subsequent calls return empty (post-reset)
			return callCount === 1 ? generateItems(21) : [];
		});
		const result = createInfiniteRemultQuery(makeMockRepo(mockFind));

		// Load first page
		await result.fetcher();
		expect(mockFind).toHaveBeenCalledTimes(1);

		result.reset();
		// Reset restores hasNextPage and clears allItems
		expect(result.hasNextPage.value).toBe(true);

		// After reset, fetcher refetches but find returns [] → 0 items
		const items = await result.fetcher();
		expect(items).toEqual([]);
	});

	it('empty result — returns [] and hasNextPage is false when mock returns []', async () => {
		const mockFind = vi.fn(async (_opts: Record<string, unknown>) => []);
		const result = createInfiniteRemultQuery(makeMockRepo(mockFind));

		const items = await result.fetcher();

		expect(items).toEqual([]);
		expect(result.hasNextPage.value).toBe(false);
	});
});
