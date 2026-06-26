# @cioky/ripple-query-remult

Remult adapter for `@cioky/ripple-query` — query, mutation, infinite query, typed invalidation registry.

## Purpose

Bridge between Remult's ORM-like `Repo<T>` and the reactive query cache. Exposes `createRemultQuery`, `mutation`, `createInfiniteRemultQuery`, and an invalidator registry — all pure logic testable without a Ripple runtime block.

## Ownership

- Source: `src/index.ts`
- Hook wrappers: `use-query.ts`, `use-live-query.ts`, `use-infinite-query.ts`
- Tests: `*.test.ts` at package root (alongside source, per monorepo convention)
- No AGENTS.md exists for `packages/ripple/query/` parent — this is the sole doc for the adapter.

## Local Contracts

- **No Ripple runtime needed for core logic tests.** `track()` returns `{ value: T }` outside a block — mock objects suffice.
- **`Repo<T>` is duck-typed.** A mock repo is a plain object with `{ metadata: { key }, find, findFirst, count, toJson }`.
- **Query cache uses ALS on server, singleton on client.** Tests set up `__rq_cache_storage` (see `query-cache.test.ts`) and call `clearCache()` in `beforeEach`.
- **Test files import from `./src/index`** (not the package name), matching `registry.test.ts` style.
- **No source edits during characterization tests** — existing behavior is sacred.

## Work Guidance

- Add tests alongside source files (package root), not in a `__tests__` subdir.
- Use `vitest` with explicit imports from `vitest` (globals enabled but imports explicit per convention).
- Plan 005 delivered: `useLiveQuery` now cleans up subscription, handles errors, returns `destroy()`.
- The invalidator registry (`registerInvalidator`/`triggerInvalidators`) is module-level state. Clean between tests if needed.

## Verification

- `bun run test` — all tests pass
- `bun run typecheck` — exit 0
- `bun run lint` — no new diagnostics in new files

## Child DOX Index

None — leaf package.
