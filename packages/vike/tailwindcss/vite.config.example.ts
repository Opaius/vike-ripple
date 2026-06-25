import { defineConfig } from 'vite';
import vike from 'vike/plugin';
import { ripple } from '@ripple-ts/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vikeRipple from '@cioky/vike-core';
import vikeRippleTailwindcss from '@cioky/vike-tailwindcss';

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
