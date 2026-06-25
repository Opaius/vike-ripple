import { defineConfig } from '@pandacss/dev'
import { pluginRipple } from '@cioky/vike-pandacss/panda-plugin'

export default defineConfig({
	preflight: true,
	include: ['./pages/**/*.{tsrx,tsx}', './renderer/**/*.{ts,tsx}'],
	exclude: [],
	plugins: [pluginRipple()],
	theme: { extend: {} },
	outdir: 'styled-system',
})
