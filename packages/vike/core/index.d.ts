declare module '@cioky/vike-core' {
	import type { Plugin } from 'vite';

	const vikeRipple: () => Plugin;
	export default vikeRipple;
}

declare module '@cioky/vike-core/config' {
	const config: Record<string, unknown>;
	export default config;
}

declare module '@cioky/vike-core/usePageContext' {
	import type { PageContext } from 'vike/types';
	export function usePageContext(): PageContext;
	export function setPageContext(ctx: PageContext): void;
}

declare module '@cioky/vike-core/useData' {
	export function useData<D = unknown>(): D;
}

declare module '@cioky/vike-core/useHydrated' {
	export function useHydrated(): boolean;
	export function setHydrated(): void;
}
