# Plan 001: Add characterization tests for @cioky/ripple-query-remult core logic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dd9f8a..HEAD -- packages/ripple/query-remult/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `0dd9f8a`, 2026-06-26

## Why this matters

`@cioky/ripple-query-remult` is the actively-developed Remult adapter for the
reactive query cache. Its core logic — `createRemultQuery`, `mutation`,
`createInfiniteRemultQuery` — has **zero test coverage**. The only existing
test file (`registry.test.ts`) covers the invalidator registry alone. This
plan establishes a characterization-test baseline so that the correctness
fixes in plans 005 and 006 can be verified against passing tests, and so
future refactors don't silently break the adapter.

## Current state

**The package under test** — `packages/ripple/query-remult/`:

- `src/index.ts` — the core module. Key exports:
  - `entityKey(repo)` (line 49) — extracts `repo.metadata.key`.
  - `buildKey(repo, method, params)` (line 100) — builds a `QueryKey` tuple.
  - `createRemultQuery(repo, method, params, options)` (line 112) — returns
    `{ fetcher, invalidate, version }`. The `fetcher` reads/writes the query
    cache, calls `repo.find/findFirst/count`, and runs `repo.toJson` on
    results. `invalidate()` deletes the cache entry and bumps `options.version`.
  - `createInfiniteRemultQuery(repo, options)` (line 194) — cursor-based
    pagination. Returns `{ fetcher, fetchNextPage, hasNextPage,
    isFetchingNextPage, error, reset }`. Uses `limit: pageSize+1` to detect
    `hasNextPage`, slices to `pageSize`, advances cursor on the last item's
    `cursorField`.
  - `mutation(repo, method, options)` (line 296) — returns `{ mutate,
    isLoading, error }`. `mutate(...args)` calls `repo.insert/update/delete/
    save`, then `triggerInvalidators(key)` for each invalidation key.
- `registry.test.ts` — the only existing test (75 lines). Covers
  `registerInvalidator`, `triggerInvalidators`, `unregisterInvalidator`.

**The `Repo<T>` interface** (duck-typed, `src/index.ts:13-19`):

```ts
export interface Repo<T> {
	metadata: { key: string };
	find(options?: Record<string, unknown>): Promise<T[]>;
	findFirst(options?: Record<string, unknown>): Promise<T | undefined>;
	count(options?: Record<string, unknown>): Promise<number>;
	toJson(item: T | T[]): unknown;
}
```

A mock repo is a plain object with those five members — no Remult runtime
needed. This is how `registry.test.ts` already works (pure logic, no Ripple
runtime).

**Repo conventions to match**:

- Test framework: Vitest. Config at `vitest.config.ts` — `include:
  ['packages/**/*.test.ts']`, `environment: 'happy-dom'`, `globals: true`.
- Test files live alongside source (see `registry.test.ts` at package root,
  and `packages/ripple/query/__tests__/*.test.ts` for the core package).
- Import from relative path: `import { ... } from './src/index'` (matching
  `registry.test.ts:6`).
- Use `describe`/`it`/`expect`/`beforeEach` from vitest (globals enabled —
  no explicit import needed, but `registry.test.ts` imports them explicitly;
  match that style).
- The existing core-query test pattern to model after:
  `packages/ripple/query/__tests__/query-cache.test.ts` — it sets up ALS,
  uses mock fetchers, and tests cache isolation/serialization/races.

**The query cache** (`@cioky/ripple-query`, peer dep) is an ALS-scoped `Map`
on the server, a module singleton on the client. For tests, set up ALS like
`query-cache.test.ts:5-11` does:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
beforeAll(() => {
	(globalThis as any).__rq_cache_storage ??= new AsyncLocalStorage();
});
```

Run each test inside `als.run(new Map(), fn)` for isolation. Import
`clearCache` from `@cioky/ripple-query` to reset between tests.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run typecheck`      | exit 0, no errors   |
| Tests     | `bun run test`           | all pass            |
| Lint      | `bun run lint`           | exit 0              |

## Scope

**In scope** (the only files you should create/modify):
- `packages/ripple/query-remult/create-remult-query.test.ts` (create)
- `packages/ripple/query-remult/mutation.test.ts` (create)
- `packages/ripple/query-remult/infinite-query.test.ts` (create)

**Out of scope** (do NOT touch):
- `packages/ripple/query-remult/src/index.ts` — no source changes; tests
  characterize existing behavior.
- `packages/ripple/query-remult/registry.test.ts` — already exists, leave it.
- `packages/ripple/query-remult/use-*.ts` / `use-*.tsrx` — the hook files;
  this plan tests the core `src/index.ts` primitives, not the hooks (which
  require a Ripple runtime/block context).
- `vitest.config.ts`, `knip.json`, `biome.json` — no config changes.

## Git workflow

- Branch: `advisor/001-query-remult-tests`
- Commit per test file; message style: `test(query-remult): add
  characterization tests for <module>`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create `create-remult-query.test.ts`

Create `packages/ripple/query-remult/create-remult-query.test.ts`. Test
`createRemultQuery` with a mock `Repo` (no Remult runtime). Cases:

1. **find happy path** — mock `repo.find` returns `[{ id: 1 }, { id: 2 }]`,
   `repo.toJson` is identity. Call `result.fetcher()`, assert it returns the
   array. Assert `repo.find` was called with the passed `params`.
2. **findFirst** — mock returns `{ id: 1 }`, assert `fetcher()` returns it.
3. **count** — mock returns `42`, assert `fetcher()` returns `42`.
4. **unknown method throws** — `method: 'badMethod'`, assert `fetcher()`
   rejects with `Unknown Remult method: badMethod`.
5. **cache population** — after `fetcher()` resolves, assert
   `getQueryCache()` from `@cioky/ripple-query` has an entry keyed by
   `JSON.stringify(buildKey(repo, method, params))` with `status` tracked
   value `'success'`.
6. **invalidate** — call `result.invalidate()`, assert the cache entry is
   gone (`getQueryCache().has(k)` is false). If `options.version` was
   passed, assert its `.value` incremented by 1.
7. **entityKey / buildKey** — assert `entityKey(repo)` returns
   `repo.metadata.key`; assert `buildKey(repo, 'find', { where: { x: 1 } })`
   returns `['TestEntity', 'find', { where: { x: 1 } }]`.

Use ALS setup (the `beforeAll` + `__rq_cache_storage` pattern). Call
`clearCache()` in `beforeEach` to isolate tests. The mock repo:

```ts
function makeMockRepo<T>(overrides: Partial<Repo<T>> = {}): Repo<T> {
	return {
		metadata: { key: 'TestEntity' },
		find: async () => [],
		findFirst: async () => undefined,
		count: async () => 0,
		toJson: (x) => x,
		...overrides,
	} as Repo<T>;
}
```

**Verify**: `bun run test -- create-remult-query` → all new tests pass.

### Step 2: Create `mutation.test.ts`

Create `packages/ripple/query-remult/mutation.test.ts`. Test `mutation()`.
Cases:

1. **insert** — mock `repo.insert` returns the inserted item. Call
   `result.mutate({ title: 'x' })`. Assert `repo.insert` called with the
   arg. Assert return value matches.
2. **update** — mock `repo.update(id, partial)` returns updated. Call
   `result.mutate(id, partial)`. Assert both args forwarded.
3. **delete** — mock `repo.delete(id)` resolves. Assert called.
4. **save** — mock `repo.save(item)` returns saved. Assert called.
5. **invalidation on success** — register a spy invalidator via
   `registerInvalidator('TestEntity', spy)`. Run an insert mutation (no
   `options.invalidates` → defaults to entity key). Assert `spy` called once.
6. **custom invalidates** — `options.invalidates: ['OtherKey']`. Register
   spy on `'OtherKey'`. Assert spy called after mutate.
7. **error handling** — mock `repo.insert` rejects. Assert `mutate()`
   rejects, `result.error.value` is an `Error`, `result.isLoading.value` is
   false (finally block).
8. **isLoading lifecycle** — assert `isLoading.value` is false initially,
   true during mutate (check inside a `vi.fn` that reads it mid-flight if
   feasible), false after. If mid-flight check is unreliable in happy-dom,
   at minimum assert false-before and false-after.

**Verify**: `bun run test -- mutation` → all new tests pass.

### Step 3: Create `infinite-query.test.ts`

Create `packages/ripple/query-remult/infinite-query.test.ts`. Test
`createInfiniteRemultQuery`. Cases:

1. **first page** — mock `repo.find` returns `pageSize + 1` items. Call
   `result.fetcher()`. Assert returns `pageSize` items (sliced). Assert
   `result.hasNextPage.value` is `true`.
2. **last page** — mock returns exactly `pageSize` items. Assert
   `hasNextPage.value` is `false` after fetch.
3. **fetchNextPage** — after first page, call `fetchNextPage()`. Assert
   `allItems` grew (fetcher returns more). Assert `isFetchingNextPage` was
   true during, false after.
4. **cursor advance** — with `orderBy: { id: 'asc' }`, `cursorField: 'id'`,
   assert the second `find` call includes `where: { id: { $gt: <last id of
   page 1> } }`.
5. **reset** — call `result.reset()`. Assert `fetcher()` returns `[]`
   (allItems cleared), `hasNextPage.value` is `true`.
6. **empty result** — mock returns `[]`. Assert `fetcher()` returns `[]`,
   `hasNextPage.value` is `false`.

The mock repo for infinite query only needs `find` and `toJson`:

```ts
function makeMockRepo<T>(findImpl: (opts: any) => Promise<T[]>): Repo<T> {
	return {
		metadata: { key: 'TestEntity' },
		find: findImpl,
		findFirst: async () => undefined,
		count: async () => 0,
		toJson: (x) => x,
	} as Repo<T>;
}
```

**Verify**: `bun run test -- infinite-query` → all new tests pass.

### Step 4: Full suite + lint + typecheck

Run the complete verification suite to ensure no regressions and the new
test files are clean.

**Verify**:
- `bun run test` → all pass (existing 29 + new tests)
- `bun run typecheck` → exit 0
- `bun run lint` → no NEW diagnostics in the new test files (existing
  diagnostics in other files are pre-existing — do not fix them here)

## Test plan

This plan IS the test plan — steps 1-3 create the tests. The done criteria
below confirm they pass and don't regress existing tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run test` exits 0; new test files exist and all their tests pass
- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` introduces no new diagnostics in the 3 new test files
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `packages/ripple/query-remult/src/index.ts` doesn't match the
  excerpts in "Current state" (e.g. function signatures changed, line numbers
  shifted significantly).
- `createRemultQuery`, `mutation`, or `createInfiniteRemultQuery` cannot be
  tested without a live Ripple runtime block (they should be pure logic —
  if they call `track()` at module scope or require an active block, STOP).
- A mock `Repo` cannot satisfy the `Repo<T>` interface (e.g. the code calls
  methods not on the interface like `repo.liveQuery`).
- The existing `registry.test.ts` stops passing after your new files are
  added (possible ALS or module-state interaction).

## Maintenance notes

- These tests characterize **current** behavior. Plan 005 changes
  `invalidateKeys`/`query()` in the core package and plan 006 changes
  `useLiveQuery` — after those land, some tests here may need adjustment
  (especially any that assert invalidate deletes the cache entry, since the
  fix in 005 changes invalidate to bump-version-not-delete for active
  subscribers).
- If `createRemultQuery`'s server-side cache-skip behavior
  (`typeof window !== 'undefined'` check at `src/index.ts:144`) is changed
  in the future, the cache-population test (step 1, case 5) needs review —
  it runs under happy-dom where `window` is defined.
- A reviewer should check that the mock repos don't accidentally test
  mock behavior instead of real logic — keep mocks minimal.
