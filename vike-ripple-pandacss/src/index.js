/**
 * Vike Ripple Panda CSS — Vite plugin entry.
 *
 * The main export provides a Vite plugin that configures Panda CSS PostCSS
 * integration for Vike + Ripple projects. The Panda CSS plugin for .tsrx
 * transformation lives at `vike-ripple-pandacss/panda-plugin`.
 *
 * ## Usage in vite.config.ts
 *   import vikeRipplePandacss from 'vike-ripple-pandacss'
 *   import { pluginRipple } from 'vike-ripple-pandacss/panda-plugin'
 *
 *   export default defineConfig({
 *     css: {
 *       postcss: {
 *         plugins: [require('@pandacss/dev/postcss')()],
 *       },
 *     },
 *     plugins: [
 *       vikeRipplePandacss(),  // ordering marker
 *       // ...
 *     ],
 *   })
 *
 *   // panda.config.ts
 *   export default defineConfig({
 *     plugins: [pluginRipple()],
 *     include: ['./pages/**\/*.{tsrx,tsx}', './src/**\/*.{ts,tsx}'],
 *   })
 */

export { pluginRipple } from './panda-plugin.js'

export default function vikeRipplePandacss() {
  return {
    name: 'vike-ripple-pandacss',
    enforce: 'pre',
  }
}
