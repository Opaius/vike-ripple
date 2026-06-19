/**
 * @vike-ripple/vike-ripple — Vike integration for Ripple TS.
 *
 * ## Setup
 * Run once:  npx vike-ripple setup
 * Or add to package.json:  "postinstall": "vike-ripple setup"
 *
 * Then add the Vite plugin to vite.config.ts:
 *   import vikeRipple from '@vike-ripple/vike-ripple'
 *   // in plugins: vikeRipple(),
 */
export default function vikeRipple() {
  return {
    name: 'vike-ripple',
    enforce: 'pre',
  }
}
