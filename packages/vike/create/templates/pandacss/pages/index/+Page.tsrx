import { css } from '~/styled-system/css'

export function Page() @{
	<>
		<head><title>Home</title></head>
		<section class={css({ minH: 'screen', display: 'flex', flexDir: 'column', alignItems: 'center', justifyContent: 'center', gap: '4', p: '8' })}>
			<h1 class={css({ fontSize: '4xl', fontWeight: 'bold' })}>Hello, Vike + Ripple!</h1>
			<p class={css({ fontSize: 'lg', color: 'blue.600' })}>With Panda CSS</p>
		</section>
	</>
}
