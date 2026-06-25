export function clientOnly() {
	console.warn('[@cioky/vike-core] clientOnly() is deprecated — use <ClientOnly>');
	return (props) => props.fallback ?? null;
}
