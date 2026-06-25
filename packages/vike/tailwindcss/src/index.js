/**
 * @cioky/vike-tailwindcss — Tailwind CSS v4 integration for Ripple TS.
 *
 * Enables @apply in Ripple <style> blocks.
 *
 * ## Setup
 * Also install @cioky/vike-core and run its setup:
 *   npx @cioky/vike-tailwindcss setup
 *
 * Then add the Vite plugin to vite.config.ts:
 *   import vikeRippleTailwindcss from '@cioky/vike-tailwindcss'
 *   // in plugins: vikeRippleTailwindcss(),
 */
export default function vikeRippleTailwindcss() {
	return {
		name: '@cioky/vike-tailwindcss',
		enforce: 'pre'
	};
}
