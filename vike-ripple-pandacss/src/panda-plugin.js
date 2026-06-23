/**
 * Panda CSS plugin for Ripple TS (.tsrx files).
 *
 * Implements the `parser:before` hook to transform .tsrx content into valid TSX
 * before Panda's ts-morph parser extracts css()/cva()/sva() calls.
 *
 * Usage in panda.config.ts:
 *   import { pluginRipple } from 'vike-ripple-pandacss/panda-plugin'
 *
 *   export default defineConfig({
 *     plugins: [pluginRipple()],
 *   })
 *
 * @module vike-ripple-pandacss/panda-plugin
 */

import { tsrxToTsx } from './tsrx-to-tsx.js';

/** @type {import('@pandacss/types').PandaPlugin} */
export function pluginRipple() {
	return {
		name: '@pandacss/plugin-ripple',
		hooks: {
			'parser:before': ({ filePath, content }) => {
				if (filePath.endsWith('.tsrx')) {
					return tsrxToTsx(content);
				}
			}
		}
	};
}
