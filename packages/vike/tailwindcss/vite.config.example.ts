import vikeRipple from '@cioky/vike-core';
import vikeRippleTailwindcss from '@cioky/vike-tailwindcss';
import { ripple } from '@ripple-ts/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vike from 'vike/plugin';
import { defineConfig } from 'vite';

export default defineConfig({
	optimizeDeps: {
		exclude: ['ripple']
	},
	plugins: [
		vikeRipple(),
		ripple({ excludeRippleExternalModules: true }),
		vike(),
		vikeRippleTailwindcss(),
		tailwindcss()
	]
});
