import { css } from '~/styled-system/css'
import { track } from 'ripple'
import { createAuthClient } from 'better-auth/client'

const authClient = createAuthClient({ baseURL: typeof window !== 'undefined' ? window.location.origin : '' })

export function Page() @{
	let &[email] = track('')
	let &[password] = track('')
	let &[errorMsg] = track('')
	let &[loading] = track(false)

	function handleSubmit(e: Event) {
		e.preventDefault()
		loading = true
		errorMsg = ''
		authClient.signIn.email({ email, password }).then(function(res: unknown) {
			const r = res as { error?: { message?: string; status?: string } }
			if (r.error) {
				errorMsg = r.error.message || r.error.status || 'Sign in failed'
			} else {
				window.location.href = '/dashboard'
			}
			loading = false
		}).catch(function(err: Error) {
			errorMsg = err.message
			loading = false
		})
	}

	<>
		<head><title>Sign In</title></head>
		<section class={css({ maxW: 'md', mx: 'auto', mt: '20', p: '8' })}>
			<form onSubmit={handleSubmit} class={css({ display: 'flex', flexDir: 'column', gap: '4' })}>
				<input type="email" placeholder="Email" value={email} onInput={(e) => { if (e.target) email = (e.target as HTMLInputElement).value }} required class={css({ p: '3', border: '1px', borderRadius: 'md', borderColor: 'gray.300', w: 'full' })} />
				<input type="password" placeholder="Password" value={password} onInput={(e) => { if (e.target) password = (e.target as HTMLInputElement).value }} required class={css({ p: '3', border: '1px', borderRadius: 'md', borderColor: 'gray.300', w: 'full' })} />
				@if (errorMsg) {
					<p class={css({ color: 'red.500', fontSize: 'sm' })}>{errorMsg}</p>
				}
				<button type="submit" disabled={loading} class={css({ p: '3', bg: 'blue.600', color: 'white', borderRadius: 'md', fontWeight: 'bold', cursor: 'pointer', _hover: { bg: 'blue.700' }, _disabled: { opacity: 0.5 } })}>
					{loading ? 'Signing in...' : 'Sign In'}
				</button>
				<p class={css({ textAlign: 'center', fontSize: 'sm', color: 'gray.600' })}>
					Don't have an account? <a href="/register" class={css({ color: 'blue.600', textDecoration: 'underline' })}>Register</a>
				</p>
			</form>
		</section>
	</>
}
