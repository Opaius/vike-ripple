import { useConfig } from '../hooks/useConfig.js'

export function useConfig() {
  const pageContext = typeof window !== 'undefined'
    ? window.__vike_pageContext
    : globalThis.__vike_pageContext

  return (values) => {
    if (!pageContext._configViaHook) {
      pageContext._configViaHook = {}
    }
    Object.assign(pageContext._configViaHook, values)
  }
}
