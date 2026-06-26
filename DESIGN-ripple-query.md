# ripple-query — Design Plan

## Goal

A tiny, framework-agnostic query cache for Ripple TS, with a zero-friction adapter for Remult.

## Packages

```
ripple-query/            ← core, deps: ripple (peer)
ripple-query-remult/     ← adapter, deps: ripple-query + remult (peers)
```

## Package: `ripple-query`

### API Surface

```ts
// Create a tracked query signal
const &[data, info] = query(
  key: QueryKey,          // ['entities', { filter }] — serialized to string
  fetcher: () => Promise<T>,
  options?: { staleTime?, gcTime? }
)

// Invalidate — bumps cache version, triggers refetch of active queries
invalidateKeys(prefix: QueryKey)   // ['todos'] invalidates ['todos'], ['todos', { done: true }]
invalidateAll()

// Low-level cache access
getQueryCache(): Map<string, QueryEntry>
```

### Core — `query-cache.ts`

```
Map<serializedKey, QueryEntry>
  QueryEntry {
    version: Tracked<number>      // bumped on invalidation → triggers re-fetch
    data: Tracked<T | undefined>
    status: Tracked<'pending' | 'success' | 'error'>
    error: Tracked<Error | undefined>
    subscribers: Set<() => void>  // GC refcount
    gcTimer?: Timer
    lastFetch: number
  }
```

### Invalidation

```
invalidateKeys(['todos'])
  → find all keys starting with ['todos']
  → bump .version on each matching entry
  → version bump triggers trackAsync to re-run fetcher

invalidateAll()
  → bump .version on every entry
```

### GC

```
- query() increments subscriber count
- When component unmounts (block disposed), decrement
- When subscribers === 0, start gcTimer (default 5min)
- On timer fire, delete entry from cache
```

### SSR

```
- Queries run during SSR populate cache
- Serialize cache entries into <script id="__rq_cache">
- Client hydrates cache before first render
- Prevents double-fetch on hydration
```

## Package: `ripple-query-remult`

### Entry point: plugin auto-patch

```ts
// user adds this import somewhere in their app:
import 'ripple-query-remult/plugin'

// Now remult.repo(Entity).find() etc return tracked signals
// instead of raw promises
```

Or explicit wrapper:

```ts
import { createRemultQuery } from 'ripple-query-remult'

const tasks = await query(
  ['tasks', { completed: true }],
  () => remult.repo(Task).find({ where: { completed: true } }),
  { liveQuery: true }  // auto-subscribe to changes
)
```

### Auto-key derivation

```
remult.repo(Task).find({ where: { completed: true }, orderBy: ... })
  → queryKey: ['Task', 'find', { where: { completed: true }, orderBy: ... }]
  → stable serialization (sorted keys, deterministic)
```

### LiveQuery integration

```
- query() with liveQuery: true
  → initial fetch populates cache
  → subscribe to Remult LiveQuery channel
  → on insert/update/delete delta → update or invalidate matching cache entries
  → on disconnect → stale-while-revalidate
```

### Cross-query invalidation (entity-level)

```
- Task entity prefix: ['Task', ...]
- mutation on Task → invalidateKeys(['Task'])
  → all Task queries refetch
  → not granular (coarse prefix), but zero-effort
```

## User Experience

### Minimal — Remult plugin approach:
```ts
// main.ts or +config.ts
import 'ripple-query-remult/plugin'

// Any page:
export function Page() @{
  let &[tasks] = trackAsync(() =>
    remult.repo(Task).find()  // auto-cached, auto-LiveQuery
  )
}
```

### Explicit — custom fetcher:
```ts
import { query } from 'ripple-query'

export function Page() @{
  let &[tasks] = query(['tasks'], () =>
    fetch('/api/tasks').then(r => r.json())
  )
}

// Elsewhere, after mutation:
invalidateKeys(['tasks'])
```

## Peer Dependency Graph

```
ripple-query
  peer: ripple (for Tracked<T>)

ripple-query-remult
  peer: ripple-query
  peer: remult
  peer: remult-partykit (for LiveQuery channel)
```

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
