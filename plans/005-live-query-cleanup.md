# Plan 005: Fix useLiveQuery — cleanup SSE subscription, handle errors, set error signal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dd9f8a..HEAD -- packages/ripple/query-remult/use-live-query.ts packages/ripple/query-remult/use-live-query.tsrx`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none (but 001's characterization tests will help verify)
- **Category**: bug
- **Planned at**: commit `0dd9f8a`, 2026-06-26

## Why this matters

`useLiveQuery` has three bugs:

1. **SSE subscription leak**: `repo.liveQuery(params).subscribe(...)` is
   called on the client but the subscription is never stored or cleaned up.
   When the component unmounts (page navigation in Vike), the subscription
   persists — it keeps mutating `items.value` on a disposed signal, and the
   WebSocket/SSE connection stays open. Over navigation, these accumulate.

2. **Unhandled rejection on SSR**: the server branch does
   `repo.find(params).then(...)` with no `.catch()`. If the find fails, the
   promise rejects silently — an unhandled rejection that crashes Node in
   strict mode or surfaces as a vague error.

3. **`error` signal never set**: the `error` Tracked is initialized to
   `undefined` and never updated. If `repo.find` or the live subscription
   throws, the consumer's `error.value` stays `undefined` — they can't
   display an error state.

## Current state

**The files** — both `use-live-query.ts` and `use-live-query.tsrx` are
identical twins (the `.tsrx` version uses `@{` syntax, the `.ts` version
uses `{`). Per the user's direction, the `.ts` version is canonical (the
package.json export map points at `.ts`, not `.tsrx`). **Fix the `.ts` file
and the `.tsrx` file identically** — or, if plan 010 (delete dead `.tsrx`
twins) has already landed, only the `.ts` file exists. Check first.

`packages/ripple/query-remult/use-live-query.ts` (40 lines):

```ts
import { track } from 'ripple'
import type { Tracked } from 'ripple'
import { entityKey, registerInvalidator } from './src/index'

export interface UseLiveQueryResult<T> {
	data: Tracked<T[]>
	isLoading: Tracked<boolean>
	error: Tracked<Error | undefined>
}

// ponytail: repo is `any` here — liveQuery isn't on our Repo<T> interface
// and remult's Repository<T>.liveQuery.subscribe has overloads that clash.
export function useLiveQuery<T>(
	repo: any,
	params?: Record<string, unknown>,
	options?: { key?: string },
): UseLiveQueryResult<T> {
	const items = track([] as T[])
	const isLoading = track(true)
	const error = track<Error | undefined>(undefined)
	const key = options?.key || entityKey(repo)

	// Client: subscribe to SSE-driven live query
	if (typeof window !== 'undefined') {
		const live = repo.liveQuery(params)
		live.subscribe((info: { items: T[]; changes: unknown[]; applyChanges: (prev: T[]) => T[] }) => {
			items.value = info.applyChanges(items.value) as T[]
			isLoading.value = false
		})
	} else {
		// SSR: one-time fetch, hydrate initial data
		repo.find(params).then((fetched: T[]) => {
			items.value = fetched
			isLoading.value = false
		})
	}

	return { data: items, isLoading, error }
}
```

**Problems visible in the code**:
- Line 25: `live.subscribe(...)` — return value (unsubscribe function) is
  discarded. No cleanup.
- Line 26: the subscribe callback has no error handling — if
  `applyChanges` throws, it's an unhandled exception inside the subscription.
- Line 32: `repo.find(params).then(...)` — no `.catch()`.
- `error` (line 20) is never assigned to `.value` anywhere.

**Conventions**:
- The `use-query.ts` hook (the read query hook) uses `trackAsync` which
  handles try/catch and sets `error.value`. `useLiveQuery` doesn't use
  `trackAsync` — it manages its own signals. Match the error-handling pattern
  from `use-query.ts:44-57` (try/catch, `error.value = err`, `finally` for
  `isLoading`).
- `registerInvalidator` is imported but never called in `useLiveQuery` —
  the `key` variable is computed but unused. This is a dead import/variable
  (biome would flag `noUnusedVariables` if it weren't suppressed for `.tsrx`).
  Either wire it up (register an invalidator that re-subscribes) or remove
  the unused import.

**How Ripple components clean up**: Ripple's `effect()` or block disposal
mechanism. The `use-query.ts` hook uses `trackAsync` which is managed by
Ripple's block lifecycle. For `useLiveQuery`, the subscription cleanup needs
to happen when the component's block is disposed. Ripple provides an
`onUnmount`/`cleanup` mechanism — check what's available:

```bash
grep -r 'onUnmount\|onCleanup\|onDestroy\|dispose\|cleanup' node_modules/ripple/dist/ 2>/dev/null | head -10
```

If Ripple doesn't expose a lifecycle cleanup hook that works outside a
`@{}` component body (the `.ts` file isn't a `.tsrx` component), the
subscription cleanup may need to be returned to the caller as a `destroy()`
function, or wired via `effect()` with a return cleanup.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun run typecheck`      | exit 0, no errors   |
| Tests     | `bun run test`           | all pass            |
| Lint      | `bun run lint`           | no new diagnostics  |

## Scope

**In scope** (the only files you should modify):
- `packages/ripple/query-remult/use-live-query.ts`
- `packages/ripple/query-remult/use-live-query.tsrx` (if it still exists —
  check first; if plan 010 already deleted it, skip)

**Out of scope** (do NOT touch):
- `packages/ripple/query-remult/src/index.ts` — the `subscribeEntity` and
  registry functions are not changed here.
- `packages/ripple/query-remult/use-query.ts` — the read query hook is
  separate; it has its own cleanup issue (plan 007 territory, not this plan).
- `packages/ripple/query-remult/use-infinite-query.ts` — separate hook.

## Git workflow

- Branch: `advisor/005-live-query-cleanup`
- Commit message: `fix(query-remult): cleanup SSE subscription, handle errors in useLiveQuery`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Store the subscription and return a cleanup function

Modify `useLiveQuery` to store the unsubscribe function returned by
`live.subscribe()` and return it (or wire it to Ripple's cleanup mechanism).

First, check what cleanup mechanism Ripple exposes:

```bash
grep -r 'onUnmount\|onCleanup\|onDestroy\|cleanup\|dispose' node_modules/ripple/dist/ 2>/dev/null | head -10
```

If Ripple has an `onCleanup(fn)` or similar lifecycle hook, use it:

```ts
import { track, onCleanup } from 'ripple'  // or whatever the export is

// ... inside useLiveQuery, client branch:
if (typeof window !== 'undefined') {
    const live = repo.liveQuery(params)
    const unsubscribe = live.subscribe((info: { ... }) => {
        try {
            items.value = info.applyChanges(items.value) as T[]
            isLoading.value = false
        } catch (e) {
            error.value = e instanceof Error ? e : new Error(String(e))
        }
    })
    // Register cleanup to unsubscribe on component disposal
    if (typeof onCleanup === 'function') {
        onCleanup(() => unsubscribe())
    }
}
```

If Ripple does NOT have a lifecycle cleanup hook accessible from a `.ts`
(non-`.tsrx`) file, return a `destroy` function in the result and document
that the caller must call it on unmount:

```ts
export interface UseLiveQueryResult<T> {
	data: Tracked<T[]>
	isLoading: Tracked<boolean>
	error: Tracked<Error | undefined>
	destroy: () => void
}
```

And in the function body, store the unsubscribe and return it:

```ts
let unsubscribe: (() => void) | null = null

if (typeof window !== 'undefined') {
    const live = repo.liveQuery(params)
    unsubscribe = live.subscribe((info: { ... }) => {
        try {
            items.value = info.applyChanges(items.value) as T[]
            isLoading.value = false
        } catch (e) {
            error.value = e instanceof Error ? e : new Error(String(e))
        }
    })
}

return {
    data: items,
    isLoading,
    error,
    destroy: () => { unsubscribe?.() }
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add error handling to the SSR branch

Fix the unhandled rejection — add `.catch()`:

```ts
} else {
    // SSR: one-time fetch, hydrate initial data
    repo.find(params)
        .then((fetched: T[]) => {
            items.value = fetched
            isLoading.value = false
        })
        .catch((e: unknown) => {
            error.value = e instanceof Error ? e : new Error(String(e))
            isLoading.value = false
        })
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Remove unused import or wire it up

`registerInvalidator` and `entityKey` are imported (line 3), and `key` is
computed (line 21) but `registerInvalidator` is never called. Either:

**Option A (wire it up)** — register an invalidator so mutations on this
entity trigger a re-subscribe:

```ts
const cleanup = registerInvalidator(key, () => {
    // On invalidation, re-fetch initial data (the live subscription
    // handles ongoing updates, but invalidation means the data changed
    // outside the live query channel)
    repo.find(params).then((fetched: T[]) => {
        items.value = fetched
    }).catch(() => {})
})
// Include in destroy:
destroy: () => { unsubscribe?.(); cleanup?.() }
```

**Option B (remove it)** — if live queries don't need invalidator registry
(the live subscription handles updates), remove the unused import and
variable:

```ts
import { track } from 'ripple'
import type { Tracked } from 'ripple'
// Remove: import { entityKey, registerInvalidator } from './src/index'
// Remove: const key = options?.key || entityKey(repo)
```

Choose option A if live queries should respond to mutation invalidation
(consistency with `useQuery`), option B if the live subscription is
self-sufficient. **Recommended: option A** — it's consistent with `useQuery`
which registers an invalidator, and the cost is one line.

**Verify**: `bun run typecheck` → exit 0. `bun run lint` → no new
`noUnusedImports` or `noUnusedVariables` diagnostics in this file.

### Step 4: Apply the same changes to the `.tsrx` twin (if it exists)

Check if `use-live-query.tsrx` still exists:

```bash
ls packages/ripple/query-remult/use-live-query.tsrx 2>/dev/null
```

If it exists, apply the identical changes (the only syntax difference is
`@{` vs `{` in the function body). If plan 010 has already deleted it, skip.

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Full verification

**Verify**:
- `bun run typecheck` → exit 0
- `bun run test` → all pass (no regressions)
- `bun run lint` → no new diagnostics in the modified files

## Test plan

This plan doesn't add new tests (the hook requires a Ripple runtime block
context which is hard to simulate in a unit test). Plan 001's
characterization tests cover the core `src/index.ts` primitives. If a future
plan adds hook-level integration tests, the cleanup behavior should be
verified:

1. `useLiveQuery` returns a `destroy()` function (or registers `onCleanup`).
2. Calling `destroy()` unsubscribes from the live query.
3. SSR `repo.find` failure sets `error.value` and `isLoading.value = false`.

Manual verification: scaffold a project with `--remult --cloudflare`, use
`useLiveQuery` in a page, navigate away and back — confirm no stale
subscriptions or console errors.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0 (no regressions)
- [ ] `bun run lint` introduces no new diagnostics in the modified files
- [ ] The client branch of `useLiveQuery` stores the unsubscribe function
  and either registers `onCleanup` or returns `destroy()`
- [ ] The SSR branch has `.catch()` on `repo.find(params).then(...)`
- [ ] `error.value` is set in both the client subscribe callback catch and
  the SSR `.catch()`
- [ ] No unused imports/variables remain in the modified file(s)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Ripple does not expose any lifecycle cleanup hook (`onCleanup`,
  `onUnmount`, etc.) and the `destroy()` return approach is unacceptable
  because callers in `.tsrx` components can't easily call it on unmount.
  Report what lifecycle APIs Ripple exposes.
- `repo.liveQuery(params).subscribe(...)` doesn't return an unsubscribe
  function — if the Remult LiveQuery API has a different cleanup mechanism
  (e.g. `live.unsubscribe()` method, or a return-with-dispose pattern),
  adapt accordingly and report the actual API shape.
- The `use-live-query.tsrx` file doesn't exist (plan 010 may have already
  deleted it) — this is fine, just skip step 4.
- The `registerInvalidator` import is used elsewhere in the file in a way
  this plan doesn't account for.

## Maintenance notes

- The `repo: any` type on `useLiveQuery` is a known compromise (the
  `Repo<T>` interface doesn't include `liveQuery`). A future plan should
  extend the `Repo<T>` interface or create a `LiveQueryRepo<T>` subtype.
- The `destroy()` return approach (if used) puts cleanup burden on the
  caller. If Ripple later exposes `onCleanup` from `.ts` files, migrate to
  that for automatic cleanup.
- A reviewer should verify that the subscription actually gets cleaned up
  on page navigation — this is the core bug being fixed. If the cleanup
  mechanism doesn't fire (e.g. `onCleanup` isn't called by Ripple's block
  disposal), the leak persists despite the code change.
