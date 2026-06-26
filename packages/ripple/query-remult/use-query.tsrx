import { track, trackAsync } from 'ripple'
import type { Tracked } from 'ripple'
import {
	createRemultQuery,
	entityKey,
	registerInvalidator,
	type Repo,
	type RemultQueryOptions,
} from './src/index'

export interface UseQueryResult<T> {
	data: Tracked<T>
	isLoading: Tracked<boolean>
	error: Tracked<Error | undefined>
	invalidate: () => void
}

export function useQuery<T>(
	repo: Repo<T>,
	method: string,
	params?: Record<string, unknown>,
	options?: RemultQueryOptions & { key?: string },
): UseQueryResult<T> @{
	const version = track(0)
	const isLoading = track(false)
	const error = track<Error | undefined>(undefined)
	const key = options?.key || entityKey(repo)

	const result = createRemultQuery(repo, method as 'find', params, { version })

	// Register for typed invalidation — mutations with matching key auto-refetch
	registerInvalidator(key, () => result.invalidate())

	const data = trackAsync(async () => {
		isLoading.value = true
		error.value = undefined
		try {
			version.value // ensure version dependency is tracked
			const res = await result.fetcher()
			return res as T
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e))
			error.value = err
			throw err
		} finally {
			isLoading.value = false
		}
	})

	return {
		data,
		isLoading,
		error,
		invalidate: () => result.invalidate(),
	}
}
