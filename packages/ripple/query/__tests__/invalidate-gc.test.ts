import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// ── Setup: same pattern as query-cache.test.ts ─────────────
// unchecked cast: set up global ALS for query cache (test infrastructure)
const _g = globalThis as unknown as {
	__rq_cache_storage?: AsyncLocalStorage<Map<string, unknown>>;
};

beforeAll(() => {
	_g.__rq_cache_storage ??= new AsyncLocalStorage();
});

async function inRequest<T>(fn: () => T): Promise<T> {
	// non-null: guaranteed by beforeAll above
	return _g.__rq_cache_storage!.run(new Map(), fn);
}

// ── invalidateKeys ─────────────────────────────────────────

describe('invalidateKeys', () => {
	it('refetches matching entries', async () => {
		// dynamic import: per-test module isolation
		// static import would share module singletons between cases
		const { query, invalidateKeys, flushPending } = await import(
			'../src/index.ts'
		);

		await inRequest(async () => {
			let callCount = 0;
			const fetcher = async () => {
				callCount++;
				return callCount;
			};

			const [data] = query<number>(['test'], fetcher);
			await flushPending();
			expect(callCount).toBe(1);
			expect(data.value).toBe(1);

			invalidateKeys(['test']);
			await flushPending();
			expect(callCount).toBe(2);
			expect(data.value).toBe(2);
		});
	});

	it('does not delete entries', async () => {
		const { query, invalidateKeys, flushPending, getQueryCache } = await import(
			'../src/index.ts'
		);

		await inRequest(async () => {
			const fetcher = async () => 'data';
			query<string>(['keep'], fetcher);
			await flushPending();

			const k = JSON.stringify(['keep']);
			expect(getQueryCache().has(k)).toBe(true);

			invalidateKeys(['keep']);
			await flushPending();
			expect(getQueryCache().has(k)).toBe(true);
		});
	});
});

// ── invalidateAll ─────────────────────────────────────────

describe('invalidateAll', () => {
	it('refetches all entries', async () => {
		const { query, invalidateAll, flushPending } = await import(
			'../src/index.ts'
		);

		await inRequest(async () => {
			let callA = 0;
			let callB = 0;
			const fetcherA = async () => {
				callA++;
				return `a${callA}`;
			};
			const fetcherB = async () => {
				callB++;
				return `b${callB}`;
			};

			const [_dataA] = query<string>(['a-key'], fetcherA);
			const [_dataB] = query<string>(['b-key'], fetcherB);
			await flushPending();
			expect(callA).toBe(1);
			expect(callB).toBe(1);

			invalidateAll();
			await flushPending();
			expect(callA).toBe(2);
			expect(callB).toBe(2);
		});
	});
});

// ── unsubscribe + GC ──────────────────────────────────────

describe('unsubscribe (GC)', () => {
	it('starts GC timer and eventually removes entry', async () => {
		// dynamic import: per-test module isolation
		const { query, unsubscribe, flushPending, getQueryCache } = await import(
			'../src/index.ts'
		);

		// Only fake timer APIs, not Date — avoid interfering with stale checks
		vi.useFakeTimers({
			toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
		});
		try {
			await inRequest(async () => {
				const fetcher = async () => 'gc-data';
				query<string>(['gc-test'], fetcher, { gcTime: 1000 });
				await flushPending();

				unsubscribe(['gc-test']);
				const k = JSON.stringify(['gc-test']);
				const entry = getQueryCache().get(k);
				expect(entry).toBeDefined();
				expect(entry!.subscribers).toBe(0);

				vi.advanceTimersByTime(1001);
				expect(getQueryCache().has(k)).toBe(false);
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('re-subscribe cancels GC timer', async () => {
		const { query, unsubscribe, flushPending, getQueryCache } = await import(
			'../src/index.ts'
		);

		vi.useFakeTimers({
			toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
		});
		try {
			await inRequest(async () => {
				const fetcher = async () => 'first';
				query<string>(['cancel-gc'], fetcher, { gcTime: 5000 });
				await flushPending();

				unsubscribe(['cancel-gc']);
				const k = JSON.stringify(['cancel-gc']);
				expect(getQueryCache().get(k)!.subscribers).toBe(0);

				// Re-subscribe before GC timer fires — cancels the pending GC
				const fetcher2 = async () => 'second';
				query<string>(['cancel-gc'], fetcher2, { gcTime: 5000 });
				const entry = getQueryCache().get(k);
				expect(entry).toBeDefined();
				expect(entry!.subscribers).toBe(1);

				// Advance past original GC time — entry should survive because timer was cleared
				vi.advanceTimersByTime(5001);
				expect(getQueryCache().has(k)).toBe(true);
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
