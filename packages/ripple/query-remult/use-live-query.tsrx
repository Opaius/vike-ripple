import type { Tracked } from 'ripple'
import { track } from 'ripple'
import { entityKey, registerInvalidator } from './src/index'

export interface UseLiveQueryResult<T> {
	data: Tracked<T[]>
	isLoading: Tracked<boolean>
	error: Tracked<Error | undefined>
	destroy: () => void
}

// ponytail: repo is `any` here — liveQuery isn't on our Repo<T> interface
// and remult's Repository<T>.liveQuery.subscribe has overloads that clash.
export function useLiveQuery<T>(
	repo: any,
	params?: Record<string, unknown>,
	options?: { key?: string },
): UseLiveQueryResult<T> @{
	const items = track([] as T[])
	const isLoading = track(true)
	const error = track<Error | undefined>(undefined)
	const key = options?.key || entityKey(repo)

	let unsubscribe: (() => void) | null = null
	// Client: subscribe to SSE-driven live query
	if (typeof window !== 'undefined') {
		const live = repo.liveQuery(params)
		unsubscribe = live.subscribe((info: { items: T[]; changes: unknown[]; applyChanges: (prev: T[]) => T[] }) => {
			try {
				items.value = info.applyChanges(items.value) as T[]
				isLoading.value = false
			} catch (e) {
				error.value = e instanceof Error ? e : new Error(String(e))
			}
		})
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

	const invalidatorCleanup = registerInvalidator(key, () => {
		repo.find(params).then((fetched: T[]) => {
			items.value = fetched
		}).catch(() => {})
	})

	return {
		data: items,
		isLoading,
		error,
		destroy: () => {
			unsubscribe?.()
			invalidatorCleanup()
		},
	}
}
