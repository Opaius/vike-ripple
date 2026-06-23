export function clientOnly() {
	console.warn('[vike-ripple] clientOnly() is deprecated — use <ClientOnly>');
	return (props) => props.fallback ?? null;
}
