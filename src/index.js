/**
 * vike-ripple — Vike extension for Ripple TS.
 *
 * ## Setup
 * 1. Import config in your renderer/+config.ts:
 *    import vikeRipple from 'vike-ripple/config'
 *
 * 2. Run setup (once):
 *    npx vike-ripple setup
 *
 * 3. Add optimizeDeps to vite.config.ts:
 *    optimizeDeps: { exclude: ['ripple'] }
 *
 * ## Usage
 * - +Head.tsrx — inject <head> content
 * - +Layout.tsrx — layout components
 * - +title.ts — per-page title
 * - +description.ts — per-page description
 * - +ssr.ts — per-page SSR toggle
 * - +stream.ts — per-page streaming toggle
 */
export default function vikeRipple() {
  return {
    name: 'vike-ripple',
    enforce: 'pre',
  }
}
