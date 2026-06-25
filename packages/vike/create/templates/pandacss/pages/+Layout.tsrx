import { type TSRXElement } from 'ripple'
import { css } from '~/styled-system/css'
import '~/src/styles.css'

export function Layout({ children }: { children: TSRXElement }) @{
	<div class={css({ minH: 'screen', bg: 'white', color: 'gray.900' })}>
		<nav class={css({ display: 'flex', gap: '4', borderBottom: '1px', px: '4', py: '3', fontSize: 'sm' })}>
			<a href="/" data-vike-link class={css({ fontWeight: 600, color: 'gray.700', _hover: { color: 'black' } })}>Home</a>
			<a href="/about" data-vike-link class={css({ color: 'gray.500', _hover: { color: 'black' } })}>About</a>
		</nav>
		{children}
	</div>
}
