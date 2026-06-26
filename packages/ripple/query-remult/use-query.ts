import type { Tracked } from 'ripple';
import { track, trackAsync } from 'ripple';
import {
	createRemultQuery,
	entityKey,
	invalidateEntity,
	type MutationResult,
	mutation,
	type RemultQueryOptions,
	type Repo,
	registerInvalidator,
	triggerInvalidators
} from './src/index';

export type { MutationResult };
export { invalidateEntity, mutation, registerInvalidator, triggerInvalidators };

export interface UseQueryResult<T> {
	data: Tracked<T[]>;
	isLoading: Tracked<boolean>;
	error: Tracked<Error | undefined>;
	invalidate: () => void;
}

/**
 * ponytail: plain .ts — track()/trackAsync() read active_block from module-level
 * variable, which is set by the parent .tsrx component during render. No .tsrx
 * compilation needed; avoids Rolldown parse errors on linked packages.
 */
export function useQuery<T>(
	repo: Repo<T>,
	method: string,
	params?: Record<string, unknown>,
	options?: RemultQueryOptions & { key?: string }
): UseQueryResult<T> {
	const version = track(0);
	const isLoading = track(false);
	const error = track<Error | undefined>(undefined);
	const key = options?.key || entityKey(repo);

	const result = createRemultQuery(repo, method as 'find', params, { version });
	registerInvalidator(key, () => result.invalidate());

	const data = trackAsync(async () => {
		isLoading.value = true;
		error.value = undefined;
		try {
			version.value;
			const res = await result.fetcher();
			return res as T[];
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			error.value = err;
			throw err;
		} finally {
			isLoading.value = false;
		}
	});

	return { data, isLoading, error, invalidate: () => result.invalidate() };
}
