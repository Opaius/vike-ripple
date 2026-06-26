# Plan 004: Fix core query() invalidation (refetch active subscribers) + implement GC + remove stale unsubscribe doc

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dd9f8a..HEAD -- packages/ripple/query/src/index.ts packages/ripple/query/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (characterization tests for query-remult — so the
  adapter tests can verify the invalidate path still works after the core
  changes)
- **Category**: bug
- **Planned at**: commit `0dd9f8a`, 2026-06-26

## Why this matters

Three problems in `@cioky/ripple-query`, all in `src/index.ts`:

1. **`invalidateKeys()` orphans active subscribers.** The DESIGN doc
   (`DESIGN-ripple-query.md:50-58`) says invalidation bumps `entry.version`
   which triggers active subscribers to refetch. The code does bump
   `entry.version.value += 1` — but then **deletes the entry from the cache**
   (`cache.delete(k)`). Active components still hold the old `entry.data`
   `Tracked` signal, which is now orphaned. The version bump is meaningless
   because nothing reads `entry.version` to trigger a refetch. Result: after
   invalidation, UI shows stale data forever (the old signal's value never
   updates).

2. **GC is unimplemented.** The DESIGN doc (lines 61-68) describes
   subscriber-refcount GC: `query()` increments subscribers, component
   unmount decrements, at zero a `gcTimer` starts, on fire the entry is
   deleted. The code increments `entry.subscribers++` (line 99) but there is
   **no decrement anywhere**, and **no `gcTimer` is ever started**. The
   README documents an `unsubscribe(key)` API (line 60) that **does not
   exist** in the code. Result: the client cache grows unbounded.

3. **`pending` promise array is module-level** (line 72). Every `runFetch()`
   pushes its promise into this shared array. `flushPending()` does
   `Promise.all(pending)` then `pending.length = 0`. Under SSR with
   AsyncLocalStorage, concurrent requests share this array — req A's
   `flushPending` awaits req B's in-flight fetches, and if A's flush runs
   first, it clears the array, so B's fetches are never awaited by B's
   flush. This breaks the ALS isolation the cache is supposed to provide.

## Current state

**The file** — `packages/ripple/query/src/index.ts` (197 lines):

```ts
// Line 72 — module-level, shared across all ALS requests:
const pending: Array<Promise<void>> = [];

// Lines 76-113 — query():
export function query<T>(
	key: QueryKey,
	fetcher: () => Promise<T>,
	options: QueryOptions = {},
): [Tracked<T | undefined>, QueryInfo] {
	const k = serializeKey(key);
	const cache = getQueryCache();
	let entry = cache.get(k) as QueryEntry<T> | undefined;

	if (!entry) {
		entry = {
			version: track(0),
			data: track<T | undefined>(undefined),
			status: track<'pending' | 'success' | 'error'>('pending'),
			error: track<Error | undefined>(undefined),
			subscribers: 0,
			gcTimer: null,
			lastFetch: 0,
			staleTime: options.staleTime ?? 0,
			gcTime: options.gcTime ?? 5 * 60 * 1000,
			fetcher,
		};
		cache.set(k, entry);
		runFetch(entry, fetcher);
	} else {
		entry.fetcher ??= fetcher;
		if (
			entry.lastFetch > 0 &&
			Date.now() - entry.lastFetch > entry.staleTime
		) {
			runFetch(entry, entry.fetcher ?? fetcher);
		}
	}

	entry.subscribers++;

	return [entry.data, { status: entry.status, error: entry.error }];
}
```

```ts
// Lines 140-153 — invalidateKeys + invalidateAll:
export function invalidateKeys(prefix: QueryKey): void {
	const p = serializeKey(prefix);
	const cache = getQueryCache();
	for (const [k, entry] of cache) {
		if (k.startsWith(p)) {
			entry.version.value += 1;
			cache.delete(k);  // ← BUG: orphans active subscribers
		}
	}
}

export function invalidateAll(): void {
	getQueryCache().clear();
}
```

```ts
// Lines 115-138 — runFetch + flushPending:
async function runFetch<T>(
	entry: QueryEntry<T>,
	fetcher: () => Promise<T>,
): Promise<void> {
	entry.status.value = 'pending';
	const p = fetcher()
		.then((result) => {
			entry.data.value = result as T;
			entry.status.value = 'success';
			entry.error.value = undefined;
			entry.lastFetch = Date.now();
		})
		.catch((e: unknown) => {
			entry.status.value = 'error';
			entry.error.value = e instanceof Error ? e : new Error(String(e));
		});
	pending.push(p);  // ← BUG: shared across ALS requests
	await p;
}

export async function flushPending(): Promise<void> {
	await Promise.all(pending);
	pending.length = 0;  // ← BUG: clears other requests' promises too
}
```

**The `QueryEntry` type** (lines 27-38):

```ts
interface QueryEntry<T = unknown> {
	data: Tracked<T | undefined>;
	version: Tracked<number>;
	status: Tracked<'pending' | 'success' | 'error'>;
	error: Tracked<Error | undefined>;
	subscribers: number;
	gcTimer: any;
	lastFetch: number;
	staleTime: number;
	gcTime: number;
	fetcher: (() => Promise<T>) | null;
}
```

**The README** — `packages/ripple/query/README.md`:

- Line 38: "Returns `Tracked<T>` — the cached value, or `undefined` while loading."
- Line 49: "Bump version on all entries whose serialized key starts with `prefix`. Triggers automatic refetch on active subscribers."
- Lines 60-62: documents `unsubscribe(key)` — "Decrement subscriber count. When count reaches zero, start GC timer." — **this function does not exist in the code.**

**Conventions**:
- TypeScript, ESM, `type: 'module'`.
- Uses `track` from `ripple` for reactive signals.
- Tests in `packages/ripple/query/__tests__/` — model after
  `query-cache.test.ts` (ALS setup, mock fetchers, describe/it/expect).
- The `version: Tracked<number>` field exists in the type but is never read
  by any refetch logic. The fix wires it up.

**How the remult adapter uses this** — `packages/ripple/query-remult/src/index.ts`:
- `createRemultQuery` (line 138) builds a key, creates a fetcher, and its
  `invalidate()` (line 187) calls `getQueryCache().delete(k)` directly +
  bumps `options.version.value`. The `use-query.ts` hook (line 41-48) reads
  `version.value` inside `trackAsync` to trigger refetch. So the remult
  adapter has its OWN refetch mechanism via the hook — it does NOT rely on
  core `query()`'s invalidation. This means fixing core `invalidateKeys()`
  won't break the adapter (the adapter bypasses it).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run typecheck`      | exit 0, no errors   |
| Tests     | `bun run test`           | all pass            |
| Lint      | `bun run lint`           | no new diagnostics  |

## Scope

**In scope** (the only files you should modify):
- `packages/ripple/query/src/index.ts`
- `packages/ripple/query/README.md`

**Out of scope** (do NOT touch):
- `packages/ripple/query-remult/**` — the adapter has its own refetch via
  hooks; it doesn't depend on core `invalidateKeys` for refetch. Plan 001
  adds tests that will confirm this.
- `packages/ripple/query/__tests__/**` — existing tests; don't modify them,
  but DO add new test files for the new behavior (see test plan below).
- `packages/vike/core/**` — the SSR integration calls `flushPending` +
  `serializeCache`; fixing `flushPending` here is the fix, not changing the
  integration.

## Git workflow

- Branch: `advisor/004-query-invalidate-gc`
- Commit per logical fix:
  1. `fix(query): make invalidateKeys refetch active subscribers instead of deleting entries`
  2. `feat(query): implement subscriber GC with gcTimer`
  3. `fix(query): scope pending promises per-request to prevent SSR cross-request race`
  4. `docs(query): remove non-existent unsubscribe from README, document actual API`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix `pending` array to be per-request (scoped to ALS)

Move the `pending` array from module-level into the per-request cache store.
The cache `Map` is already ALS-scoped on the server and singleton on the
client. Add a parallel per-request pending array.

Replace the module-level `const pending: Array<Promise<void>> = [];` (line
72) with a per-request accessor, similar to `getQueryCache()`:

```ts
function getPending(): Array<Promise<void>> {
	const storage = _getStorage();
	if (storage) {
		const store = storage.getStore();
		if (store instanceof Map) {
			// Store pending promises on the ALS store under a symbol key
			// to avoid polluting the cache Map type.
			if (!(store as any).__pending) {
				(store as any).__pending = [];
			}
			return (store as any).__pending;
		}
	}
	// Client singleton
	if (!_fallbackPending) _fallbackPending = [];
	return _fallbackPending;
}

let _fallbackPending: Array<Promise<void>> | null = null;
```

Then in `runFetch()`, replace `pending.push(p)` with `getPending().push(p)`.
In `flushPending()`, replace `await Promise.all(pending); pending.length = 0;`
with:

```ts
export async function flushPending(): Promise<void> {
	const p = getPending();
	await Promise.all(p);
	p.length = 0;
}
```

**Verify**: `bun run typecheck` → exit 0. Then `bun run test` — the
existing `als-cache.test.ts` tests should still pass (they test ALS
isolation; this change makes `flushPending` also isolated).

### Step 2: Fix `invalidateKeys` — bump version, do NOT delete

Replace the `invalidateKeys` function (lines 140-149):

```ts
export function invalidateKeys(prefix: QueryKey): void {
	const p = serializeKey(prefix);
	const cache = getQueryCache();
	for (const [k, entry] of cache) {
		if (k.startsWith(p)) {
			entry.version.value += 1;
			// Do NOT delete — active subscribers hold entry.data Tracked.
			// The version bump signals them to refetch. Entry stays in cache
			// for subscribers to read; GC handles removal when subscribers
			// hit zero.
			if (entry.fetcher) {
				runFetch(entry, entry.fetcher);
			}
		}
	}
}
```

The key change: remove `cache.delete(k)`, and **call `runFetch` to refetch**
using the stored `entry.fetcher`. This is what the DESIGN doc describes:
"version bump triggers trackAsync to re-run fetcher." Since core `query()`
doesn't use `trackAsync` (the remult hooks do), the direct `runFetch` call
is the core-equivalent: it re-populates `entry.data.value`, which is the
`Tracked` signal active subscribers are reading.

**Verify**: `bun run typecheck` → exit 0. `bun run test` — existing tests
pass. (Some existing tests in `query-cache.test.ts` may assert that
`invalidateKeys` deletes entries — if so, those assertions need updating to
match the new behavior. Check the test file's `invalidateKeys` describe
block and update assertions to expect the entry to remain with bumped version.
This is expected: the tests characterized buggy behavior.)

### Step 3: Implement GC — add `unsubscribe()` and `gcTimer` logic

Add a new exported `unsubscribe(key)` function that decrements
`entry.subscribers` and starts the GC timer at zero:

```ts
export function unsubscribe(key: QueryKey): void {
	const k = serializeKey(key);
	const cache = getQueryCache();
	const entry = cache.get(k);
	if (!entry) return;

	entry.subscribers--;
	if (entry.subscribers <= 0) {
		entry.subscribers = 0;
		if (entry.gcTimer) clearTimeout(entry.gcTimer);
		entry.gcTimer = setTimeout(() => {
			cache.delete(k);
		}, entry.gcTime);
	}
}
```

Also add a `subscribe` helper (or just document that `query()` handles the
increment — it already does at line 99). No new increment function needed;
`query()` already does `entry.subscribers++`.

**Verify**: `bun run typecheck` → exit 0 (the function is new, should
compile). `bun run test` — existing tests pass.

### Step 4: Fix `invalidateAll` to use the same refetch logic

Currently `invalidateAll` does `getQueryCache().clear()` — same orphaning
problem as the old `invalidateKeys`. Change it to refetch all entries:

```ts
export function invalidateAll(): void {
	const cache = getQueryCache();
	for (const [, entry] of cache) {
		entry.version.value += 1;
		if (entry.fetcher) {
			runFetch(entry, entry.fetcher);
		}
	}
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Update README — remove `unsubscribe` lie, document actual behavior

In `packages/ripple/query/README.md`:

1. The `unsubscribe(key)` section (lines 60-62) — this function now EXISTS
   (added in step 3), so update the doc to match the actual signature:
   `unsubscribe(key: QueryKey)` — decrements subscriber count, starts GC
   timer when count hits zero.

2. The `invalidateKeys` section (line 49) — update to reflect that it now
   refetches active entries (no longer deletes them):
   "Bump version on all entries whose serialized key starts with `prefix`
   and triggers a refetch. Active subscribers see updated data via their
   Tracked signal."

3. Add a note about GC: "Cache entries are garbage-collected when all
   subscribers have unsubscribed and the `gcTime` (default 5 min) has
   elapsed."

**Verify**: Read the updated README. `bun run lint` → no new diagnostics.

### Step 6: Add tests for the new behavior

Create `packages/ripple/query/__tests__/invalidate-gc.test.ts`. Model after
`query-cache.test.ts` (ALS setup, mock fetchers). Cases:

1. **invalidateKeys refetches** — `query(key, fetcher)`, wait for success,
   `invalidateKeys(prefix)`, assert `fetcher` called a second time, assert
   `entry.data.value` updated to the new fetcher result.
2. **invalidateKeys does NOT delete** — after invalidation, assert
   `getQueryCache().has(k)` is true.
3. **invalidateAll refetches all** — two queries, `invalidateAll()`, assert
   both fetchers called again.
4. **unsubscribe starts GC** — `query(key, fetcher)`, `unsubscribe(key)`,
   assert `entry.subscribers` is 0. (Testing the timer requires fake timers —
   use `vi.useFakeTimers()` and `vi.advanceTimersByTime(gcTime + 1)`, then
   assert `cache.has(k)` is false.)
5. **unsubscribe before GC fires** — `query`, `unsubscribe`, then `query`
   again before timer fires — assert subscriber count is 1 again (GC timer
   should be cleared by the new `query()` call; check if `query()` needs to
   clear `entry.gcTimer` — if it does, add that to `query()` too).

**Verify**: `bun run test -- invalidate-gc` → all new tests pass.

### Step 7: Full verification

**Verify**:
- `bun run typecheck` → exit 0
- `bun run test` → all pass (existing + new tests; update any existing test
  that asserted the old delete-on-invalidate behavior)
- `bun run lint` → no new diagnostics in modified files

## Test plan

Covered in step 6 above. New test file:
`packages/ripple/query/__tests__/invalidate-gc.test.ts`. Pattern:
`packages/ripple/query/__tests__/query-cache.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; new tests for invalidate-refetch + GC exist and pass
- [ ] `grep 'cache.delete(k)' packages/ripple/query/src/index.ts` returns no match inside `invalidateKeys` (the GC `cache.delete` inside `setTimeout` is fine)
- [ ] `grep 'const pending' packages/ripple/query/src/index.ts` returns no module-level match (it's now per-request)
- [ ] `grep 'export function unsubscribe' packages/ripple/query/src/index.ts` returns a match
- [ ] `packages/ripple/query/README.md` has no reference to a non-existent `unsubscribe` (it now exists and is documented accurately)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `query()` function's return type `[Tracked<T | undefined>, QueryInfo]`
  doesn't give callers a way to call `unsubscribe` — the fix may require
  changing the return shape to include an unsubscribe function. If so, this
  is a breaking API change; STOP and report (the remult hooks may need
  updating too).
- The existing tests in `query-cache.test.ts` assert that `invalidateKeys`
  deletes entries, and updating them reveals the old behavior was relied
  upon by other code. Check `query-remult` — its `createRemultQuery` has its
  own `invalidate` that calls `getQueryCache().delete(k)` directly (line
  188). If the remult adapter depends on delete-on-invalidate semantics,
  STOP and report.
- `runFetch` cannot be called safely from `invalidateKeys` because it's
  defined after `invalidateKeys` in the file (hoisting issue) — if so, just
  reorder the function definitions.
- The Ripple `track()` / `Tracked<T>` API doesn't support the pattern where
  bumping `version.value` + calling `runFetch` actually notifies components
  reading `entry.data` — if `Tracked` signals don't propagate this way,
  the core refetch mechanism may need a different approach. Report what the
  Ripple reactivity model requires.

## Maintenance notes

- This plan changes core `@cioky/ripple-query` public API behavior
  (invalidate now refetches instead of deleting; `unsubscribe` is new).
  The remult adapter (`query-remult`) has its own refetch mechanism via
  hooks and `version` tracking, so it should be unaffected — but plan 001's
  characterization tests will confirm.
- If a caller was depending on `invalidateKeys` deleting the cache entry
  (clearing the data to `undefined`), they now get a refetch instead. This
  is the correct behavior per the DESIGN doc, but it's a semantic change.
- The `pending` array fix (step 1) is the fix for the SSR cross-request race
  (finding #2). Plan 003 (streaming cache) depends on `flushPending` being
  safe — this plan makes it safe.
- A reviewer should check that `query()` clears any existing `gcTimer` when
  re-subscribing to an entry (otherwise a pending GC could fire and delete
  an entry that just got a new subscriber).
- The `gcTimer` uses `setTimeout` — on the server (SSR) this is Node's
  `setTimeout`; on the client it's the browser's. Both are available
  globally. The GC is primarily a client concern (server entries are
  per-request and die with the ALS store).
