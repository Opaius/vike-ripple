import { css } from '~/styled-system/css'
import type { Data } from './+data.server'

export function Page(data: Data) @{
	const { user } = data

	<>
		<head><title>Dashboard</title></head>
		<section class={css({ maxW: '2xl', mx: 'auto', mt: '20', p: '8' })}>
			@if (!user) {
				<div class={css({ textAlign: 'center', py: '10' })}>
					<h1 class={css({ fontSize: '2xl', fontWeight: 'bold', mb: '4' })}>Not Authenticated</h1>
					<p class={css({ color: 'gray.600', mb: '6' })}>Please sign in to view this page.</p>
					<a href="/login" class={css({ display: 'inline-block', p: '3', bg: 'blue.600', color: 'white', borderRadius: 'md', textDecoration: 'none' })}>Sign In</a>
				</div>
			} @else {
				<div>
					<h1 class={css({ fontSize: '2xl', fontWeight: 'bold', mb: '6' })}>Dashboard</h1>
					<div class={css({ bg: 'gray.50', p: '6', borderRadius: 'lg', border: '1px', borderColor: 'gray.200' })}>
						<p class={css({ mb: '2' })}><strong>Welcome, {user.name || user.email}!</strong></p>
						<p class={css({ color: 'gray.600', fontSize: 'sm' })}>Email: {user.email}</p>
						<p class={css({ color: 'gray.600', fontSize: 'sm' })}>User ID: {user.id}</p>
					</div>
					<div class={css({ mt: '6', display: 'flex', gap: '4' })}>
						<a href="/" class={css({ color: 'blue.600' })}>Home</a>
						<a href="/about" class={css({ color: 'blue.600' })}>About</a>
					</div>
				</div>
			}
		</section>
	</>
}
