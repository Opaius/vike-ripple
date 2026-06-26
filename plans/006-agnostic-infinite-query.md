# Plan 006: Add framework-agnostic infinite query to ripple-query core, keep Remult-specific version in query-remult

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dd9f8a..HEAD -- packages/ripple/query/src/index.ts packages/ripple/query-remult/src/index.ts packages/ripple/query/package.json packages/ripple/query-remult/use-infinite-query.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (characterization tests — the query-remult infinite
  query tests validate the existing behavior before the core extraction)
- **Category**: direction
- **Planned at**: commit `0dd9f8a`, 2026-06-26

## Why this matters

`DESIGN-ripple-query.md` lists "Paginated / infinite queries (v2)" as
out-of-scope for v1 — but `@cioky/ripple-query-remult` already ships a
complete, cursor-based infinite query (`createInfiniteRemultQuery` at
`src/index.ts:194` + the `useInfiniteQuery` hook). It works, but it's locked
behind the Remult adapter: a user fetching from a REST API or any non-Remult
source can't get infinite query behavior from the core `@cioky/ripple-query`
package.

The user's direction: **both** an agnostic infinite query in core
`ripple-query` AND the Remult-specific one in `ripple-query-remult`. The
Remult version stays where it is (it uses `repo.find` with cursor-based
`where` clauses and `repo.toJson` — Remult-specific). The core gets a
framework-agnostic `createInfiniteQuery(fetcher, config)` that works with
any async data source.

## Current state

**The existing Remult infinite query** — `packages/ripple/query-remult/src/index.ts:194-271`:

```ts
export function createInfiniteRemultQuery<T>(
    repo: Repo<T>,
    options: InfiniteRemultQueryConfig = {},
): InfiniteRemultQueryResult<T> {
    const pageSize = options.pageSize ?? 20;
    const orderByKeys = options.orderBy ? Object.keys(options.orderBy) : [];
    const cursorField = options.cursorField ?? orderByKeys[0] ?? 'id';
    const sortDir = orderByKeys.length > 0
        ? (options.orderBy as Record<string, unknown>)[orderByKeys[0]] : undefined;
    const cursorOp = sortDir === 'desc' ? '$lt' : '$gt';

    const hasNextPage = track(true);
    const isFetchingNextPage = track(false);
    const error = track<Error | undefined>(undefined);
    const pageVersion = track(0);

    let allItems: T[] = [];
    let cursor: string | number | null = null;

    function buildParams(): Record<string, unknown> {
        const params: Record<string, unknown> = { limit: pageSize + 1 };
        if (options.orderBy || options.where) {
            const mergedWhere: Record<string, unknown> = {};
            if (options.where) Object.assign(mergedWhere, options.where);
            if (cursor != null) mergedWhere[cursorField] = { [cursorOp]: cursor };
            (params as any).where = mergedWhere;
            if (options.orderBy) (params as any).orderBy = options.orderBy;
        }
        return params;
    }

    async function fetchPage(): Promise<void> {
        isFetchingNextPage.value = true;
        error.value = undefined;
        try {
            const params = buildParams();
            const items = await repo.find(params);
            const hasMoreItems = items.length > pageSize;
            const pageItems = hasMoreItems ? items.slice(0, pageSize) : items;
            const json = repo.toJson(pageItems as T[]) as T[];
            if (pageItems.length > 0) {
                const last = pageItems[pageItems.length - 1] as any;
                cursor = last[cursorField];
            }
            hasNextPage.value = hasMoreItems;
            allItems.push(...json);
        } catch (e) {
            error.value = e instanceof Error ? e : new Error(String(e));
        } finally {
            isFetchingNextPage.value = false;
        }
    }

    async function fetcher(): Promise<T[]> {
        hasNextPage.value;
        pageVersion.value;
        if (allItems.length === 0 && hasNextPage.value) {
            await fetchPage();
            pageVersion.value += 1;
        }
        return [...allItems];
    }

    async function fetchNextPage(): Promise<void> {
        if (isFetchingNextPage.value || !hasNextPage.value) return;
        await fetchPage();
        pageVersion.value += 1;
    }
    function reset(): void {
        allItems = [];
        cursor = null;
        hasNextPage.value = true;
        pageVersion.value += 1;
    }

    return { fetcher, fetchNextPage, hasNextPage, isFetchingNextPage, error, reset };
}
```

**What's Remult-specific vs. agnostic**:
- Remult-specific: `repo.find(params)`, `repo.toJson()`, the `buildParams()`
  with `where: { cursorField: { $gt/$lt: cursor } }` (Remult query syntax),
  the `limit: pageSize + 1` trick (Remult-specific over-fetch detection).
- Agnostic concepts: cursor-based pagination, `hasNextPage`/`isFetchingNextPage`
  signals, `fetchNextPage()`, `reset()`, accumulating items, `pageVersion`
  for reactivity.

**The core package** — `packages/ripple/query/src/index.ts` (197 lines):
exports `query()`, `invalidateKeys()`, `invalidateAll()`, `getQueryCache()`,
`clearCache()`, `flushPending()`, `serializeCache()`, `hydrateCache()`. No
infinite query. Uses `track` from `ripple` for signals.

**The core package.json** — `packages/ripple/query/package.json`:

```json
{
    "name": "@cioky/ripple-query",
    "version": "0.2.0",
    "exports": {
        ".": {
            "types": "./src/index.ts",
            "default": "./src/index.ts"
        }
    },
    "files": ["src"],
    "peerDependencies": {
        "ripple": ">=0.3.0"
    }
}
```

**Conventions**:
- TypeScript, ESM, `type: 'module'`.
- Uses `track` from `ripple` for reactive signals.
- The agnostic version should NOT depend on `@cioky/ripple-query-remult` or
  `remult` — it's in the core package, peer dep is `ripple` only.
- The fetcher-based API (like `query(key, fetcher, options)`) is the pattern
  to follow — the user provides the async function, the library manages
  state.
- Tests in `packages/ripple/query/__tests__/` — model after
  `query-cache.test.ts`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run typecheck`      | exit 0, no errors   |
| Tests     | `bun run test`           | all pass            |
| Lint      | `bun run lint`           | no new diagnostics  |

## Scope

**In scope** (the only files you should modify/create):
- `packages/ripple/query/src/index.ts` (add `createInfiniteQuery` + types)
- `packages/ripple/query/src/infinite-query.ts` (create — new module for the
  infinite query, imported by `index.ts`)
- `packages/ripple/query/__tests__/infinite-query.test.ts` (create — tests)
- `packages/ripple/query/README.md` (document the new API)
- `DESIGN-ripple-query.md` (update "Out of Scope" — infinite query is now in
  scope)

**Out of scope** (do NOT touch):
- `packages/ripple/query-remult/src/index.ts` — the Remult-specific
  `createInfiniteRemultQuery` stays as-is. It's a thin wrapper that uses
  `repo.find` with Remult query syntax. The agnostic core version doesn't
  replace it.
- `packages/ripple/query-remult/use-infinite-query.ts` — the Remult hook
  stays as-is.
- `packages/ripple/query/package.json` — no new exports needed if the
  infinite query is exported from the main `index.ts` (the `.` export
  already points at `src/index.ts`). If a separate `./infinite` export is
  desired, add it — but the simpler path is exporting from the main entry.

## Git workflow

- Branch: `advisor/006-agnostic-infinite-query`
- Commit messages:
  1. `feat(query): add framework-agnostic createInfiniteQuery to core package`
  2. `test(query): add tests for createInfiniteQuery`
  3. `docs(query): document infinite query API, update DESIGN scope`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create `packages/ripple/query/src/infinite-query.ts`

Create the agnostic infinite query module. The API:

```ts
import { track } from 'ripple';
import type { Tracked } from 'ripple';

export interface InfiniteQueryConfig<T> {
	/** Page size — passed to the fetcher as `limit`. Default 20. */
	pageSize?: number;
	/** The fetcher receives a cursor (null on first page) and limit, returns a page of items. */
	fetcher: (cursor: string | number | null, limit: number) => Promise<T[]>;
	/** Extract the cursor from the last item of a page. Default: `(item) => (item as any).id`. */
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
	config: InfiniteQueryConfig<T>,
): InfiniteQueryResult<T> {
	const pageSize = config.pageSize ?? 20;
	const getCursor = config.getCursor ?? ((item: T) => (item as any).id);

	const data = track<T[]>([]);
	const hasNextPage = track(true);
	const isFetchingNextPage = track(false);
	const error = track<Error | undefined>(undefined);

	let cursor: string | number | null = null;
	let hasFetchedFirstPage = false;

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
			hasFetchedFirstPage = true;
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
		hasFetchedFirstPage = false;
	}

	return {
		data,
		hasNextPage,
		isFetchingNextPage,
		error,
		fetchNextPage,
		reset,
	};
}
```

**Key design decisions**:
- The fetcher receives `(cursor, limit)` — the caller decides how to use
  them (REST `?cursor=X&limit=Y`, GraphQL `after: X, first: Y`, etc.).
- `limit: pageSize + 1` is passed to the fetcher so the caller can
  over-fetch by one to detect `hasNextPage` (same trick as the Remult
  version). The caller returns `pageSize + 1` items if there's more; the
  library slices to `pageSize`.
- `getCursor` defaults to `(item) => item.id` but is configurable — the
  caller may use a different cursor field.
- No `query()` cache integration in v1 — the infinite query manages its own
  state via `Tracked` signals, separate from the `Map`-based cache. This
  matches the Remult version which also doesn't use the core cache for
  infinite queries.

**Verify**: `bun run typecheck` → exit 0 (the file is new; it should
compile against the `ripple` peer dep types).

### Step 2: Export from `packages/ripple/query/src/index.ts`

Add the export at the end of `index.ts`:

```ts
// ── Infinite Query ────────────────────────────────────────
export { createInfiniteQuery } from './infinite-query.js';
export type { InfiniteQueryConfig, InfiniteQueryResult } from './infinite-query.js';
```

Use `.js` extension in the import path (NodeNext module resolution requires
it even for TypeScript source — the repo uses `module: 'NodeNext'` in
tsconfig).

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Create `packages/ripple/query/__tests__/infinite-query.test.ts`

Test the agnostic infinite query with a mock fetcher. Cases:

1. **First page** — mock fetcher returns `pageSize + 1` items. Call
   `fetchNextPage()`. Assert `data.value` has `pageSize` items (sliced).
   Assert `hasNextPage.value` is `true`.
2. **Last page** — mock returns exactly `pageSize` items. Assert
   `hasNextPage.value` is `false`.
3. **fetchNextPage no-op when fetching** — call `fetchNextPage()` twice
   concurrently; assert fetcher called once (guard via
   `isFetchingNextPage`).
4. **fetchNextPage no-op when no next page** — after `hasNextPage` is false,
   call `fetchNextPage()`; assert fetcher not called again.
5. **cursor advance** — first page returns items with ids `[1,2,...,20]`,
   second page returns `[21,22,...,40]`. Assert the second fetcher call
   received `cursor: 20` (the last item's id from page 1).
6. **reset** — after fetching two pages, call `reset()`. Assert `data.value`
   is `[]`, `hasNextPage.value` is `true`, `cursor` is null (verify by
   fetching again and checking the fetcher receives `null` cursor).
7. **error handling** — mock fetcher rejects. Assert `error.value` is an
   `Error`, `isFetchingNextPage.value` is `false`.
8. **custom getCursor** — items have `{ uuid: 'abc' }`, config `getCursor:
   (item) => item.uuid`. Assert the cursor passed to the second fetcher
   call is the `uuid` of the last item.

```ts
import { describe, it, expect, vi } from 'vitest';
import { createInfiniteQuery } from '../src/infinite-query.js';

describe('createInfiniteQuery', () => {
    it('fetches first page and detects hasNextPage', async () => {
        const fetcher = vi.fn(async () => Array.from({ length: 21 }, (_, i) => ({ id: i + 1 })));
        const q = createInfiniteQuery({ fetcher, pageSize: 20 });
        await q.fetchNextPage();
        expect(q.data.value).toHaveLength(20);
        expect(q.hasNextPage.value).toBe(true);
    });
    // ... rest of cases
});
```

**Verify**: `bun run test -- infinite-query` → all new tests pass.

### Step 4: Update README and DESIGN doc

**`packages/ripple/query/README.md`** — add a section after the existing API
docs:

```markdown
### `createInfiniteQuery(config)`

Framework-agnostic cursor-based infinite query. Works with any async data
source (REST, GraphQL, etc.).

```ts
import { createInfiniteQuery } from '@cioky/ripple-query'

const q = createInfiniteQuery({
  pageSize: 20,
  fetcher: (cursor, limit) =>
    fetch(`/api/items?cursor=${cursor ?? ''}&limit=${limit}`)
      .then(r => r.json()),
  // getCursor defaults to (item) => item.id
})

// In a component:
let { data, hasNextPage, isFetchingNextPage, fetchNextPage } = q

@if (hasNextPage) {
  <button onclick={fetchNextPage}>Load more</button>
}
```

| Config | Type | Default | Description |
|--------|------|---------|-------------|
| `pageSize` | `number` | `20` | Items per page |
| `fetcher` | `(cursor, limit) => Promise<T[]>` | — | Fetch a page; receives cursor (null on first page) and limit (pageSize + 1) |
| `getCursor` | `(item) => string\|number` | `(item) => item.id` | Extract cursor from last item of a page |
```

**`DESIGN-ripple-query.md`** — update the "Out of Scope (v1)" section.
Remove "Paginated / infinite queries (v2)" and add a note:

```markdown
## Out of Scope (v1)

- Optimistic updates (v2)
- Mutation cache (v2 — for now, use `remult.repo(T).insert()` directly or
  the `mutation()` helper in `@cioky/ripple-query-remult`)
- Persisted cache to localStorage/IndexedDB (v2)
- Offline support (v3)

## Scope updates

- **Infinite/paginated queries** — moved IN SCOPE. `createInfiniteQuery()`
  is available in `@cioky/ripple-query` (framework-agnostic) and
  `createInfiniteRemultQuery()` in `@cioky/ripple-query-remult` (Remult-
  specific, with auto-cursor detection from `orderBy`).
```

**Verify**: Read the updated docs. `bun run lint` → no new diagnostics.

### Step 5: Full verification

**Verify**:
- `bun run typecheck` → exit 0
- `bun run test` → all pass (existing + new infinite-query tests)
- `bun run lint` → no new diagnostics in modified/created files

## Test plan

Covered in step 3. New test file:
`packages/ripple/query/__tests__/infinite-query.test.ts`. Pattern:
`packages/ripple/query/__tests__/query-cache.test.ts` (Vitest, mock data,
describe/it/expect).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; new tests for `createInfiniteQuery` exist and pass
- [ ] `grep 'createInfiniteQuery' packages/ripple/query/src/index.ts` returns a match (exported)
- [ ] `packages/ripple/query/src/infinite-query.ts` exists
- [ ] `packages/ripple/query/__tests__/infinite-query.test.ts` exists and passes
- [ ] `DESIGN-ripple-query.md` no longer lists infinite queries as "Out of Scope (v1)"
- [ ] `packages/ripple/query/README.md` documents `createInfiniteQuery`
- [ ] The Remult-specific `createInfiniteRemultQuery` in `query-remult/src/index.ts` is unchanged
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `ripple` package's `track()` API doesn't support the pattern of
  mutating `data.value = [...data.value, ...pageItems]` (array replacement)
  in a way that notifies subscribers — if `Tracked<T[]>` requires a
  different mutation pattern (e.g. `.push()` on the raw array), adapt the
  code and report the correct pattern.
- The `module: 'NodeNext'` tsconfig requires `.js` extensions in imports
  but the existing `index.ts` doesn't use them (check — the existing file
  imports from `ripple` without an extension, which works for npm packages
  but not for relative paths under NodeNext). If relative imports need a
  different extension or the build tooling handles it differently, report.
- The `createInfiniteQuery` type signature clashes with the existing
  `query()` function's types in a way that requires renaming.
- The Remult `createInfiniteRemultQuery` should be refactored to use the
  new core `createInfiniteQuery` internally — this is a follow-up, NOT part
  of this plan. If it seems like they should share code, note it as a
  follow-up but don't do it here (keep the Remult version independent to
  avoid coupling).

## Maintenance notes

- The agnostic `createInfiniteQuery` and the Remult `createInfiniteRemultQuery`
  are intentionally separate. The Remult version uses Remult query syntax
  (`where: { field: { $gt: cursor } }`, `repo.toJson()`) which is
  Remult-specific. A future refactor could make the Remult version delegate
  to the core version with a custom fetcher — but that's a follow-up, not
  this plan.
- The `getCursor` default `(item) => item.id` assumes items have an `id`
  field. For APIs without `id`, the user must provide `getCursor`. Document
  this clearly.
- The `pageSize + 1` over-fetch trick assumes the API supports a `limit`
  parameter. For APIs that use offset-based pagination instead of cursor,
  the user would need a different approach — the fetcher receives the
  cursor but the user decides how to translate it. This is fine for v1.
- A reviewer should check that the `data.value = [...data.value, ...pageItems]`
  pattern actually triggers Ripple reactivity (spreads create a new array
  reference, which should trigger `Tracked` subscribers). If not, the
  pattern needs adjustment.
- The DESIGN doc update moves infinite queries from "out of scope" to "in
  scope" — this is a scope change the maintainer has approved per the
  direction finding.
