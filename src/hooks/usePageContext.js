export { usePageContext }
export { setPageContext }

import { track, effect } from 'ripple'

let _currentPageContext = null
const _listeners = new Set()

function usePageContext() {
  if (typeof window === 'undefined') {
    const storage = globalThis.__ripple_page_context_storage
    return storage ? storage.getStore() : null
  }

  const ctx = track(_currentPageContext)

  effect(() => {
    _listeners.add(ctx)
    return () => {
      _listeners.delete(ctx)
    }
  })

  return ctx.value
}

function setPageContext(ctx) {
  if (typeof window === 'undefined') return
  _currentPageContext = ctx
  for (const signal of _listeners) {
    signal.value = ctx
  }
}



