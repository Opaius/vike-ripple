import { type TSRXElement } from 'ripple'

export function Layout({ children }: { children: TSRXElement }) @{
	<div>
		{children}
	</div>
}
