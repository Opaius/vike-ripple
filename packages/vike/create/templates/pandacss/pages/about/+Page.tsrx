import { css } from '~/styled-system/css'

export function Page() @{
	<>
		<head><title>About</title></head>
		<section class={css({ mx: 'auto', maxW: '2xl', p: '8' })}>
			<h1 class={css({ fontSize: '3xl', fontWeight: 'bold', mb: '4' })}>About</h1>
			<p class={css({ color: 'gray.600' })}>This scaffold was created by @cioky/vike-create.</p>
			<p class={css({ color: 'gray.600' })}>Scaffolded with Panda CSS + Ripple TS plugin.</p>
		</section>
	</>
}
