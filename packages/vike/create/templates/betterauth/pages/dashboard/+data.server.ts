import type { PageContextServer } from 'vike/types';

export type Data = {
	user: { name?: string; email?: string; id?: string } | null;
};

export default async function data(
	pageContext: PageContextServer
): Promise<Data> {
	return {
		user:
			((pageContext as unknown as Record<string, unknown>)
				.user as Data['user']) ?? null
	};
}
