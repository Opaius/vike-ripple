import { type TSRXElement } from 'ripple'

export function Layout({ children }: { children: TSRXElement }) @{
	<div class="min-h-screen bg-white text-gray-900">
		<nav class="flex gap-4 border-b px-4 py-3 text-sm">
			<a href="/" data-vike-link class="font-semibold text-gray-700 hover:text-black">Home</a>
			<a href="/about" data-vike-link class="text-gray-500 hover:text-black">About</a>
		</nav>
		{children}
	</div>
}
