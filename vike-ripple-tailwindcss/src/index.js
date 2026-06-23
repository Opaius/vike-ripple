/**
 * @vike-ripple/tailwindcss — Tailwind CSS v4 integration for Ripple TS.
 *
 * Enables @apply in Ripple <style> blocks.
 *
 * ## Setup
 * Also install @vike-ripple/vike-ripple and run its setup:
 *   npx vike-ripple-tailwindcss setup
 *
 * Then add the Vite plugin to vite.config.ts:
 *   import vikeRippleTailwindcss from '@vike-ripple/tailwindcss'
 *   // in plugins: vikeRippleTailwindcss(),
 */
export default function vikeRippleTailwindcss() {
  return {
    name: 'vike-ripple-tailwindcss',
    enforce: 'pre',
  }
}
