import { usePageContext } from './usePageContext.js'

export function useData() {
  const pageContext = usePageContext()
  return pageContext?.data
}
