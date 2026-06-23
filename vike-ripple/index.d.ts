declare module 'vike-ripple' {
	import type { Plugin } from 'vite';
	const vikeRipple: () => Plugin;
	export default vikeRipple;
}

declare module 'vike-ripple/config' {
	const config: Record<string, unknown>;
	export default config;
}

declare module 'vike-ripple/usePageContext' {
	import type { PageContext } from 'vike/types';
	export function usePageContext(): PageContext;
	export function setPageContext(ctx: PageContext): void;
}

declare module 'vike-ripple/useData' {
	export function useData<D = unknown>(): D;
}

declare module 'vike-ripple/useHydrated' {
	export function useHydrated(): boolean;
	export function setHydrated(): void;
}
