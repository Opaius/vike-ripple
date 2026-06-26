/**
 * Characterization tests for createRemultQuery() — pure logic, no Ripple component runtime needed.
 * Covers: find, findFirst, count, unknown method, cache population, invalidate, entityKey, buildKey.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { clearCache, getQueryCache } from '@cioky/ripple-query';
import { track } from 'ripple';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildKey, createRemultQuery, entityKey, type Repo } from './src/index';

// ── ALS setup ────────────────────────────────────────────────────────────────────
// Mirrors onRenderHtml.js — provides a request-scoped cache so getQueryCache() works
// without falling back to the module-level singleton.
interface GlobalWithCache {
	__rq_cache_storage?: AsyncLocalStorage<Map<string, unknown>>;
}

beforeAll(() => {
	(globalThis as unknown as GlobalWithCache).__rq_cache_storage ??=
		new AsyncLocalStorage();
});

beforeEach(() => {
	clearCache();
});

// ── Mock repo factory ────────────────────────────────────────────────────────────

function makeMockRepo<T>(overrides: Partial<Repo<T>> = {}): Repo<T> {
	return {
		metadata: { key: 'TestEntity' },
		find: async () => [],
		findFirst: async () => undefined,
		count: async () => 0,
		toJson: (x) => x,
		...overrides
	} as Repo<T>;
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('createRemultQuery', () => {
	it('find happy path — calls repo.find with params and returns transformed data', async () => {
		const items = [{ id: 1 }, { id: 2 }];
		const repo = makeMockRepo<{ id: number }>({
			find: async (params) => {
				expect(params).toEqual({ where: { status: 'active' } });
				return items;
			}
		});
		const result = createRemultQuery(repo, 'find', {
			where: { status: 'active' }
		});
		const data = await result.fetcher();
		expect(data).toEqual(items);
	});

	it('findFirst — calls repo.findFirst and returns the value', async () => {
		const item = { id: 1 };
		const repo = makeMockRepo<{ id: number }>({
			findFirst: async () => item
		});
		const result = createRemultQuery(repo, 'findFirst', { where: { id: 1 } });
		const data = await result.fetcher();
		expect(data).toEqual(item);
	});

	it('count — calls repo.count and returns the number', async () => {
		const repo = makeMockRepo({
			count: async () => 42
		});
		const result = createRemultQuery(repo, 'count');
		const data = await result.fetcher();
		expect(data).toBe(42);
	});

	it('unknown method throws', async () => {
		const repo = makeMockRepo();
		const result = createRemultQuery(repo, 'badMethod');
		await expect(result.fetcher()).rejects.toThrow(
			'Unknown Remult method: badMethod'
		);
	});

	it('cache population — after fetcher resolves, cache has entry with status success', async () => {
		const items = [{ id: 1 }];
		const repo = makeMockRepo<{ id: number }>({
			find: async () => items
		});
		const method = 'find';
		const params = { where: { id: 1 } };
		const result = createRemultQuery(repo, method, params);
		await result.fetcher();
		const key = JSON.stringify(buildKey(repo, method, params));
		const entry = getQueryCache().get(key);
		expect(entry).toBeDefined();
		expect(entry!.status.value).toBe('success');
	});

	it('invalidate — removes cache entry and bumps version', async () => {
		const items = [{ id: 1 }];
		const version = track(0);
		const repo = makeMockRepo<{ id: number }>({
			find: async () => items
		});
		const result = createRemultQuery(
			repo,
			'find',
			{ where: { id: 1 } },
			{ version }
		);
		await result.fetcher();
		const key = JSON.stringify(buildKey(repo, 'find', { where: { id: 1 } }));
		expect(getQueryCache().has(key)).toBe(true);
		result.invalidate();
		expect(getQueryCache().has(key)).toBe(false);
		expect(version.value).toBe(1);
	});
});

describe('entityKey / buildKey', () => {
	it('entityKey returns repo.metadata.key', () => {
		const repo = makeMockRepo();
		expect(entityKey(repo)).toBe('TestEntity');
	});

	it('buildKey returns array with entity key, method, and params', () => {
		const repo = makeMockRepo();
		expect(buildKey(repo, 'find', { where: { x: 1 } })).toEqual([
			'TestEntity',
			'find',
			{ where: { x: 1 } }
		]);
	});
});
