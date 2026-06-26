import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeAll, describe, expect, it } from 'vitest';

// ── Setup: like onRenderHtml.js does ────────────────────
beforeAll(() => {
	(globalThis as any).__rq_cache_storage ??= new AsyncLocalStorage();
});

async function inRequest<T>(fn: () => T): Promise<T> {
	return (globalThis as any).__rq_cache_storage.run(new Map(), fn);
}

// ── Core: getQueryCache / clearCache ────────────────────

describe('getQueryCache', () => {
	it('returns fresh Map inside each ALS request', async () => {
		const { getQueryCache } = await import('../src/index.ts');
		const cacheA = await inRequest(() => getQueryCache());
		const cacheB = await inRequest(() => getQueryCache());
		expect(cacheA).not.toBe(cacheB);
	});

	it('returns fallback singleton outside ALS (client path)', async () => {
		const { getQueryCache } = await import('../src/index.ts');
		const a = getQueryCache();
		const b = getQueryCache();
		expect(a).toBe(b);
	});
});

describe('clearCache', () => {
	it('clears only the current request cache, not others', async () => {
		const { getQueryCache, clearCache } = await import('../src/index.ts');

		const [sizeA, sizeB] = await Promise.all([
			inRequest(() => {
				getQueryCache().set('a', {} as any);
				clearCache();
				return getQueryCache().size;
			}),
			inRequest(() => {
				getQueryCache().set('b', {} as any);
				return getQueryCache().size;
			})
		]);

		expect(sizeA).toBe(0); // cleared
		expect(sizeB).toBe(1); // untouched
	});
});

// ── Cross-request contamination (SECURITY) ──────────────

describe('cross-request contamination', () => {
	it('concurrent requests have isolated caches', async () => {
		const { getQueryCache } = await import('../src/index.ts');

		const results = await Promise.all([
			inRequest(() => {
				getQueryCache().set('user-a-data', { ssn: '123-45-6789' });
				return [...getQueryCache().keys()];
			}),
			inRequest(() => {
				getQueryCache().set('user-b-data', { ssn: '987-65-4321' });
				return [...getQueryCache().keys()];
			})
		]);

		expect(results[0]).toEqual(['user-a-data']);
		expect(results[1]).toEqual(['user-b-data']);
	});

	it('clearCache between requests prevents data leakage', async () => {
		const { getQueryCache, clearCache } = await import('../src/index.ts');

		// First request: populate
		await inRequest(() => {
			getQueryCache().set('sensitive', { secret: 'top' });
		});

		// Second request: clear then populate
		await inRequest(() => {
			clearCache();
			expect(getQueryCache().has('sensitive')).toBe(false);
			getQueryCache().set('public', { data: 'ok' });
		});

		// Third request: verify previous request's data is gone
		await inRequest(() => {
			expect(getQueryCache().has('sensitive')).toBe(false);
			expect(getQueryCache().has('public')).toBe(false);
		});
	});
});

// ── Serialization roundtrip ─────────────────────────────

describe('serializeCache / hydrateCache', () => {
	it('produces serialized JSON script tag', async () => {
		const { getQueryCache, serializeCache } = await import('../src/index.ts');

		const tag = await inRequest(() => {
			const key = JSON.stringify(['tasks', 'find']);
			getQueryCache().set(key, {
				version: { value: 0 } as any,
				data: { value: [{ id: 1, title: 'test' }] } as any,
				status: { value: 'success' } as any,
				error: { value: undefined } as any,
				subscribers: 0,
				gcTimer: null,
				lastFetch: Date.now(),
				staleTime: 0,
				gcTime: 5 * 60 * 1000,
				fetcher: null
			});
			return serializeCache();
		});

		expect(tag).toContain('__rq_cache');
		expect(tag).toContain('"test"');
	});

	it('roundtrip: SSR serialize → client hydrate → data matches', async () => {
		const { getQueryCache, serializeCache, hydrateCache } = await import(
			'../src/index.ts'
		);

		// SSR side: populate and serialize
		const ssrTag = await inRequest(() => {
			const key = JSON.stringify(['roundtrip', 'find']);
			getQueryCache().set(key, {
				version: { value: 0 } as any,
				data: { value: { name: 'roundtrip-test' } } as any,
				status: { value: 'success' } as any,
				error: { value: undefined } as any,
				subscribers: 0,
				gcTimer: null,
				lastFetch: Date.now(),
				staleTime: 0,
				gcTime: 5 * 60 * 1000,
				fetcher: null
			});
			return serializeCache();
		});

		// Client side: inject SSR script and hydrate
		const el = document.createElement('script');
		el.id = '__rq_cache';
		el.type = 'application/json';
		// Extract just the JSON from the script tag
		const jsonMatch = ssrTag.match(/>(.*)<\/script>/);
		el.textContent = jsonMatch ? jsonMatch[1] : '[]';
		document.body.appendChild(el);

		hydrateCache();

		const clientCache = getQueryCache();
		const key = JSON.stringify(['roundtrip', 'find']);
		expect(clientCache.has(key)).toBe(true);
		const entry = clientCache.get(key)!;
		expect(entry.data.value).toEqual({ name: 'roundtrip-test' });
		expect(entry.status.value).toBe('success');

		el.remove();
	});

	it('ignores malformed JSON gracefully', () => {
		const { hydrateCache } = require('../src/index.ts');
		const el = document.createElement('script');
		el.id = '__rq_cache';
		el.type = 'application/json';
		el.textContent = 'not valid json!!!';
		document.body.appendChild(el);

		expect(() => hydrateCache()).not.toThrow();
		el.remove();
	});

	it('skips hydration when no SSR script exists', () => {
		const { hydrateCache } = require('../src/index.ts');
		expect(() => hydrateCache()).not.toThrow();
	});
});

// ── Race conditions ─────────────────────────────────────

describe('race conditions', () => {
	it('concurrent writes to different keys are safe', async () => {
		const { getQueryCache } = await import('../src/index.ts');

		await inRequest(async () => {
			const promises = Array.from({ length: 50 }, (_, i) =>
				Promise.resolve().then(() => {
					getQueryCache().set(`key-${i}`, { data: i } as any);
				})
			);
			await Promise.all(promises);

			expect(getQueryCache().size).toBe(50);
		});
	});

	it('concurrent read/write to same key is safe', async () => {
		const { getQueryCache } = await import('../src/index.ts');

		await inRequest(async () => {
			const key = 'contended';
			getQueryCache().set(key, { data: 0 } as any);

			const readers = Array.from({ length: 20 }, () =>
				Promise.resolve().then(() => {
					const entry = getQueryCache().get(key);
					return entry?.data;
				})
			);

			const writers = Array.from({ length: 20 }, (_, i) =>
				Promise.resolve().then(() => {
					getQueryCache().set(key, { data: i } as any);
				})
			);

			await Promise.all([...readers, ...writers]);
			// Should not throw — Map operations are synchronous and safe
			expect(getQueryCache().has(key)).toBe(true);
		});
	});
});

// ── Memory / bounds ─────────────────────────────────────

describe('memory bounds', () => {
	it('large number of entries does not crash', async () => {
		const { getQueryCache, clearCache } = await import('../src/index.ts');

		await inRequest(() => {
			const count = 10_000;
			for (let i = 0; i < count; i++) {
				getQueryCache().set(`big-key-${i}`, { data: i } as any);
			}
			expect(getQueryCache().size).toBe(count);
			clearCache();
			expect(getQueryCache().size).toBe(0);
		});
	});

	it('large values do not crash serialization', async () => {
		const { getQueryCache, serializeCache } = await import('../src/index.ts');

		const tag = await inRequest(() => {
			const key = JSON.stringify(['big-data']);
			const bigArray = Array.from({ length: 1000 }, (_, i) => ({
				id: i,
				title: 'x'.repeat(100)
			}));
			getQueryCache().set(key, {
				version: { value: 0 } as any,
				data: { value: bigArray } as any,
				status: { value: 'success' } as any,
				error: { value: undefined } as any,
				subscribers: 0,
				gcTimer: null,
				lastFetch: Date.now(),
				staleTime: 0,
				gcTime: 5 * 60 * 1000,
				fetcher: null
			});
			return serializeCache();
		});

		expect(tag.length).toBeGreaterThan(1000);
		expect(tag).toContain('__rq_cache');
	});
});

// ── Edge cases ──────────────────────────────────────────

describe('edge cases', () => {
	it('getQueryCache with no entries returns empty Map', async () => {
		const { getQueryCache } = await import('../src/index.ts');
		const cache = await inRequest(() => getQueryCache());
		expect(cache.size).toBe(0);
	});

	it('clearCache on empty cache does not throw', async () => {
		const { clearCache } = await import('../src/index.ts');
		expect(() => clearCache()).not.toThrow();
	});
});
