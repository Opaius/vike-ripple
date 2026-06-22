export { useConfig }

import { getPageContext } from 'vike/getPageContext'
import { usePageContext } from '../usePageContext.js'

function useConfig() {
  let pageContext = getPageContext({ asyncHook: false })
  if (pageContext) {
    return (config) => {
      pageContext._configViaHook ??= {}
      Object.assign(pageContext._configViaHook, config)
    }
  }

  pageContext = usePageContext()
  return (config) => {
    if (pageContext) {
      if (!('_headAlreadySet' in pageContext)) {
        pageContext._configViaHook ??= {}
        Object.assign(pageContext._configViaHook, config)
      } else {
        if (config.title) document.title = config.title
        if (config.lang) document.documentElement.lang = config.lang
      }
    }
  }
}
