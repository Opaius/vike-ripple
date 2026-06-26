# @cioky/ripple-query

Tiny, framework-agnostic query cache for Ripple TS — `Tracked`-based, GC-collected, SSR-friendly.

```
bun add @cioky/ripple-query
```

## Usage

```tsx
import { query, invalidateKeys } from '@cioky/ripple-query'

export function TaskList() @{
  let &[tasks] = query(['todos', { done: true }], () =>
    fetch('/api/todos?done=true').then(r => r.json())
  )

  @if (tasks === undefined) {
    <p>Loading...</p>
  } @else {
    <ul>
      @for (const t of tasks) {
        <li>{t.title}</li>
      }
    </ul>
  }
}

// After a mutation:
invalidateKeys(['todos'])  // refetches all matching queries
```

## API

### `query(key, fetcher, options?)`

Returns `Tracked<T>` — the cached value, or `undefined` while loading.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `key` | `QueryKey` | — | Serializable tuple identifying the cache entry |
| `fetcher` | `() => Promise<T>` | — | Async function that fetches fresh data |
| `options.staleTime` | `number` | `0` | ms before data is considered stale (triggers background refetch) |
| `options.gcTime` | `number` | `300000` | ms before unused cache entry is evicted (default 5 min) |

### `invalidateKeys(prefix)`

Bump version on all entries whose serialized key starts with `prefix` and triggers a refetch via the stored fetcher. Active subscribers see updated data through their Tracked signal. Entries are NOT deleted — GC handles removal when subscribers reach zero.

```ts
invalidateKeys(['todos'])                     // invalidates ['todos'], ['todos', { done: true }]
invalidateKeys(['Task'])                       // invalidates all Task queries
```

### `invalidateAll()`

Invalidate every cached entry.

### `unsubscribe(key)`

Decrement subscriber count for the given key. When count reaches zero, a GC timer starts. After `gcTime` (default 5 min) the entry is removed from the cache. If a new subscriber calls `query()` before the timer fires, the GC timer is cancelled and the entry is reused.

## Garbage Collection

Cache entries are garbage-collected when their subscriber count reaches zero and the configured `gcTime` (default 5 minutes) has elapsed. Calling `query()` again before the timer fires cancels the GC timer and reuses the entry.

### SSR

```ts
import { serializeCache, hydrateCache } from '@cioky/ripple-query'

// Server: embed in HTML
function onRenderHtml(pageContext) {
  return { documentHtml: `...${serializeCache()}...` }
}

// Client: hydrate before first render
hydrateCache()
```

## Peer Dependencies

- `ripple` >= 0.3.0
