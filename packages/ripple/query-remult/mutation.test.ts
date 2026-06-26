/**
 * Unit tests for mutation() — pure logic, no Ripple runtime hooks needed.
 */
import { describe, expect, it, vi } from 'vitest';
import { mutation, type Repo, registerInvalidator } from './src/index';

function mockRepo<T>(
	key: string,
	overrides: Record<string, any> = {}
): Repo<T> {
	return {
		metadata: { key },
		...overrides
	} as unknown as Repo<T>;
}

const item = { id: 1, title: 'x' };

describe('mutation', () => {
	it('insert calls repo.insert and returns result', async () => {
		const insert = vi.fn().mockResolvedValue(item);
		const repo = mockRepo<typeof item>('Todo', { insert });
		const result = mutation(repo, 'insert');

		const val = await result.mutate({ title: 'x' });

		expect(insert).toHaveBeenCalledWith({ title: 'x' });
		expect(val).toEqual(item);
	});

	it('update forwards id and partial', async () => {
		const update = vi.fn().mockResolvedValue(item);
		const repo = mockRepo('Todo', { update });
		const result = mutation(repo, 'update');

		const val = await result.mutate(1, { title: 'y' });

		expect(update).toHaveBeenCalledWith(1, { title: 'y' });
		expect(val).toEqual(item);
	});

	it('delete calls repo.delete with id', async () => {
		const del = vi.fn().mockResolvedValue(undefined);
		const repo = mockRepo('Todo', { delete: del });
		const result = mutation(repo, 'delete');

		await result.mutate(42);

		expect(del).toHaveBeenCalledWith(42);
	});

	it('save calls repo.save with item', async () => {
		const save = vi.fn().mockResolvedValue(item);
		const repo = mockRepo('Todo', { save });
		const result = mutation(repo, 'save');

		const val = await result.mutate(item);

		expect(save).toHaveBeenCalledWith(item);
		expect(val).toEqual(item);
	});

	it('invalidates entity key on success by default', async () => {
		const insert = vi.fn().mockResolvedValue(item);
		const repo = mockRepo<typeof item>('Todo', { insert });
		const spy = vi.fn();
		registerInvalidator('Todo', spy);

		await mutation(repo, 'insert').mutate({ title: 'x' });

		expect(spy).toHaveBeenCalledOnce();
	});

	it('invalidates custom keys when options.invalidates is set', async () => {
		const insert = vi.fn().mockResolvedValue(item);
		const repo = mockRepo<typeof item>('Todo', { insert });
		const spy = vi.fn();
		registerInvalidator('OtherKey', spy);

		await mutation(repo, 'insert', { invalidates: ['OtherKey'] }).mutate({
			title: 'x'
		});

		expect(spy).toHaveBeenCalledOnce();
	});

	it('sets error and resets isLoading when repo rejects', async () => {
		const err = new Error('db error');
		const insert = vi.fn().mockRejectedValue(err);
		const repo = mockRepo('Todo', { insert });
		const result = mutation(repo, 'insert');

		await expect(result.mutate({ title: 'x' })).rejects.toThrow('db error');
		expect(result.error.value).toBe(err);
		expect(result.isLoading.value).toBe(false);
	});

	it('tracks isLoading lifecycle', async () => {
		const insert = vi.fn().mockResolvedValue(item);
		const repo = mockRepo('Todo', { insert });
		const result = mutation(repo, 'insert');

		expect(result.isLoading.value).toBe(false);
		await result.mutate({ title: 'x' });
		expect(result.isLoading.value).toBe(false);
	});
});
