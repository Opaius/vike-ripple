import { describe, it, expect, beforeAll } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';

// Setup ALS like onRenderHtml.js does
beforeAll(() => {
	(globalThis as any).__rq_cache_storage ??= new AsyncLocalStorage();
});

describe('ALS per-request cache isolation', () => {
	it('returns fallback singleton outside ALS context (client path)', async () => {
		const { getQueryCache } = await import('../src/index.ts');
		const cache = getQueryCache();
		expect(cache).toBeDefined();
		expect(cache.size).toBe(0);
	});

	it('provides fresh cache per request inside ALS run', async () => {
		const { getQueryCache, clearCache } = await import('../src/index.ts');

		const results = await Promise.all([
			(globalThis as any).__rq_cache_storage.run(new Map(), async () => {
				const c = getQueryCache();
				c.set('req-a', { data: 'from-a' });
				return [...c.keys()];
			}),
			(globalThis as any).__rq_cache_storage.run(new Map(), async () => {
				const c = getQueryCache();
				c.set('req-b', { data: 'from-b' });
				return [...c.keys()];
			}),
		]);

		expect(results[0]).toEqual(['req-a']);
		expect(results[1]).toEqual(['req-b']);
		expect(results[0]).not.toEqual(results[1]);

		clearCache();
	});

	it('isolates ALS cache from fallback singleton', async () => {
		const { getQueryCache } = await import('../src/index.ts');

		// Populate ALS cache
		await (globalThis as any).__rq_cache_storage.run(new Map(), async () => {
			getQueryCache().set('als-only', { data: 'als' });
		});

		// Fallback should not have ALS entries
		const { getQueryCache: getQC } = await import('../src/index.ts');
		expect(getQC().has('als-only')).toBe(false);
	});
});

describe('clearCache and serialization', () => {
	it('clears only the current ALS cache', async () => {
		const { getQueryCache, clearCache } = await import('../src/index.ts');

		await (globalThis as any).__rq_cache_storage.run(new Map(), async () => {
			getQueryCache().set('to-clear', { data: 'x' });
			expect(getQueryCache().size).toBe(1);
			clearCache();
			expect(getQueryCache().size).toBe(0);
		});
	});

	it('serializeCache produces JSON script tag', async () => {
		const { getQueryCache, serializeCache } = await import('../src/index.ts');

		await (globalThis as any).__rq_cache_storage.run(new Map(), async () => {
			// Simulate an SSR fetch: populate cache with a success entry
			const cache = getQueryCache();
			const key = JSON.stringify(['test-entity', 'find']);
			cache.set(key, {
				version: null as any,
				data: { value: [{ id: 1, title: 'test' }] } as any,
				status: { value: 'success' } as any,
				error: { value: undefined } as any,
				subscribers: 0,
				gcTimer: null,
				lastFetch: Date.now(),
				staleTime: 0,
				gcTime: 5 * 60 * 1000,
				fetcher: null,
			});

			const tag = serializeCache();
			expect(tag).toContain('__rq_cache');
			expect(tag).toContain('test-entity');
			expect(tag).toContain('"title":"test"');
		});
	});

	it('hydrateCache restores entries on client', async () => {
		const { getQueryCache, hydrateCache } = await import('../src/index.ts');

		const key = JSON.stringify(['cached-entity', 'find']);
		const ssrData = JSON.stringify([
			{ key, data: [{ id: 1, name: 'hydrated' }] },
		]);

		// Simulate the SSR script tag that hydrateCache reads
		const el = document.createElement('script');
		el.id = '__rq_cache';
		el.type = 'application/json';
		el.textContent = ssrData;
		document.body.appendChild(el);

		hydrateCache();

		const cache = getQueryCache();
		expect(cache.has(key)).toBe(true);
		const entry = cache.get(key)!;
		expect(entry.data.value).toEqual([{ id: 1, name: 'hydrated' }]);
		expect(entry.status.value).toBe('success');

		el.remove();
	});
});
