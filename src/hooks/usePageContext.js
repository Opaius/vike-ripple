export function usePageContext() {
  const pageContext = typeof window !== 'undefined'
    ? window.__vike_pageContext
    : globalThis.__vike_pageContext
  return pageContext
}
