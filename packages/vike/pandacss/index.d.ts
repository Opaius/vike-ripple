declare module '@cioky/vike-pandacss' {
	import type { Plugin } from 'vite';
	const plugin: () => Plugin;
	export default plugin;
}

declare module '@cioky/vike-pandacss/panda-plugin' {
	import type { PandaPlugin } from '@pandacss/types';

	/**
	 * Panda CSS plugin for Ripple TS (.tsrx files).
	 * Transforms .tsrx content into valid TSX before Panda extracts
	 * css()/cva()/sva() calls via the `parser:before` hook.
	 */
	export function pluginRipple(): PandaPlugin;

	/**
	 * Core transform: converts Ripple .tsrx syntax to parseable TSX.
	 * Strips <style>, converts @{} → {}, @if/for → {} blocks,
	 * &[var] → var declarations.
	 */
	export function tsrxToTsx(code: string): string;
}

declare module '@cioky/vike-pandacss/setup' {
	export {};
}
