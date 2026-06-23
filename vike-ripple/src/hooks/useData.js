export { useData }

import { usePageContext } from './usePageContext.js'

function useData() {
  return usePageContext()?.data
}
