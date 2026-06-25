# @cioky/ripple-query

Tiny, framework-agnostic query cache for Ripple TS — `Tracked`-based, GC-collected, SSR-friendly.

```
bun add @cioky/ripple-query
```

## Usage

```ts
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

Returns `[data, info]` where both are `Tracked` signals.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `key` | `QueryKey` | — | Serializable tuple identifying the cache entry |
| `fetcher` | `() => Promise<T>` | — | Async function that fetches fresh data |
| `options.staleTime` | `number` | `0` | ms before data is considered stale (triggers background refetch) |
| `options.gcTime` | `number` | `300000` | ms before unused cache entry is evicted (default 5 min) |

### `invalidateKeys(prefix)`

Bump version on all entries whose serialized key starts with `prefix`. Triggers automatic refetch on active subscribers.

```ts
invalidateKeys(['todos'])                     // invalidates ['todos'], ['todos', { done: true }]
invalidateKeys(['Task'])                       // invalidates all Task queries
```

### `invalidateAll()`

Invalidate every cached entry.

### `unsubscribe(key)`

Decrement subscriber count. When count reaches zero, start GC timer. Call in block cleanup.

### SSR

```ts
// Server: embed in HTML
import { serializeCache } from '@cioky/ripple-query'

function onRenderHtml(pageContext) {
  return { documentHtml: `...${serializeCache()}...` }
}

// Client: hydrate before first render
import { hydrateCache } from '@cioky/ripple-query'
hydrateCache()
```

## Peer Dependencies

- `ripple` >= 0.3.0
