/**
 * @cioky/vike-core — Vike + Ripple integration.
 *
 * Single entry point. Returns an array of plugins:
 * - vike/plugin
 * - @ripple-ts/vite-plugin
 * - dedupe config (resolve.dedupe, optimizeDeps.include)
 *
 * Usage:
 * ```ts
 * import vikeRipple from 'vike-ripple'
 * export default defineConfig({ plugins: [vikeRipple()] })
 * ```
 */
import vike from 'vike/plugin';
import { ripple } from '@ripple-ts/vite-plugin';
export default function vikeRipple() {
	return [
		vike(),
		ripple({ excludeRippleExternalModules: true }),
		{
			name: '@cioky/vike-core',
			enforce: 'pre',
			config() {
				return {
					resolve: {
						dedupe: ['ripple'],
					},
					optimizeDeps: {
						include: [
							'ripple',
							'@cioky/ripple-query',
							'@cioky/ripple-query-remult',
						],
					},
					environments: {
						ssr: {
							resolve: {
								dedupe: ['ripple'],
								noExternal: [
									'@cioky/ripple-query',
									'@cioky/ripple-query-remult',
								],
							},
						},
					},
				};
			},
		},
	];
}
