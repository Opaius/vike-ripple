# @cioky/ripple-query-remult

Remult adapter for `@cioky/ripple-query` — `useQuery`, `mutation`, typed invalidation registry, LiveQuery, and Infinite Query.

```
bun add @cioky/ripple-query-remult
```

## Usage

```tsx
import { remult } from 'remult'
import { useQuery, mutation } from '@cioky/ripple-query-remult/use-query'
import { Task } from '~/entities/task'

export function Page() @{
  const repo = remult.repo(Task)
  const q = useQuery(repo, 'find', { orderBy: { createdAt: 'desc' } })
  const { mutate: add } = mutation(repo, 'insert')

  async function handleSubmit() {
    await add({ title })
  }

  <>
    @if (q.data.value === undefined) {
      <p>Loading...</p>
    } @else {
      @for (let task of q.data.value) {
        <div>{task.title}</div>
      }
    }
    <button onClick={handleSubmit}>Add</button>
  </>
}
```

## API

### `useQuery(repo, method, params?, options?)`

Returns `{ data: Tracked<T[]>, isLoading: Tracked<boolean>, error: Tracked<Error | undefined>, invalidate: () => void }`.

Queries auto-invalidate via the registry — mutations with matching entity key trigger automatic refetch.

| Param | Type | Description |
|-------|------|-------------|
| `repo` | `Repository<T>` | A Remult repo, e.g. `remult.repo(Task)` |
| `method` | `'find'` | Query method |
| `params` | `Record<string, unknown>` | Query params (where, orderBy, limit) |
| `options.key` | `string` | Custom registry key (defaults to entity name) |
| `options.liveQuery` | `boolean` | Subscribe to entity SSE channel for realtime invalidation |

### `mutation(repo, method, options?)`

Returns `{ mutate: (...args) => Promise<T>, isLoading: Tracked<boolean>, error: Tracked<Error | undefined> }`.

Auto-invalidates queries with the entity's key on success.

| Param | Type | Description |
|-------|------|-------------|
| `invalidates` | `string \| string[]` | Query keys to invalidate (defaults to entity name) |

```tsx
const { mutate: save } = mutation(repo, 'insert')
const { mutate: update } = mutation(repo, 'update', { invalidates: ['Task', 'User'] })
```

### `registerInvalidator(key, fn)`

Register a custom invalidation callback. Returns cleanup function.

### `triggerInvalidators(key)`

Manually trigger all registered invalidators for a key. Useful for external invalidation (e.g. websocket).

### `useLiveQuery(repo, params?, options?)`

Returns `{ data: Tracked<T[]>, isLoading: Tracked<boolean>, error: Tracked<Error | undefined> }`. SSE-driven real-time updates.

### `useInfiniteQuery(repo, options?)`

Returns `{ data: Tracked<T[]>, isLoading: Tracked<boolean>, error: Tracked<Error | undefined>, hasNextPage: Tracked<boolean>, isFetchingNextPage: Tracked<boolean>, fetchNextPage: () => Promise<void>, invalidate: () => void }`.

## SSR

Use `q.data.value` in `@if` and `@for` blocks — SSR-safe, no pending read errors. Avoid reading Trackeds at component root scope (guards, `&[]` destructure) during SSR.

## Peer Dependencies

- `@cioky/ripple-query` >= 0.2.x
- `remult` >= 0.26.0
- `remult-partykit` >= 0.0.1
