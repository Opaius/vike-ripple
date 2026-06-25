# @cioky/ripple-query-remult

Remult adapter for `@cioky/ripple-query` — automatic key derivation from Remult queries, LiveQuery invalidation.

```
bun add @cioky/ripple-query-remult
```

## Usage

```ts
import { createRemultQuery } from '@cioky/ripple-query-remult'
import { remult } from 'remult'

export function TaskList() @{
  let &[tasks] = createRemultQuery(
    remult.repo(Task),
    'find',
    { where: { completed: true } },
    { liveQuery: true }
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
```

## API

### `createRemultQuery(repo, method, params?, options?)`

Returns `[data, info]` where both are `Tracked` signals. Generates a stable query key from `[entityName, method, params]`.

| Param | Type | Description |
|-------|------|-------------|
| `repo` | `Repo<T>` | A Remult repo, e.g. `remult.repo(Task)` |
| `method` | `'find' \| 'findFirst' \| 'count'` | Query method |
| `params` | `Record<string, unknown>` | Query params (where, orderBy, limit, etc.) |
| `options.liveQuery` | `boolean` | Subscribe to entity SSE channel for realtime invalidation |

### Manual key building

```ts
import { buildKey } from '@cioky/ripple-query-remult'
import { query, invalidateKeys } from '@cioky/ripple-query'

const key = buildKey(remult.repo(Task), 'find', { where: { done: true } })
const [tasks] = query(key, () => remult.repo(Task).find({ where: { done: true } }))

// Later, after a Task mutation:
invalidateKeys(['Task'])  // invalidates ALL Task queries
```

### `subscribeEntity(entityName)`

Manually subscribe to LiveQuery changes for an entity. Safe to call multiple times — deduplicates.

### Re-exports from `@cioky/ripple-query`

- `invalidateKeys`
- `invalidateAll`
- `QueryKey`, `QueryInfo`

## Peer Dependencies

- `@cioky/ripple-query` >= 0.1.x
- `remult` >= 0.26.0
- `remult-partykit` >= 0.0.1
