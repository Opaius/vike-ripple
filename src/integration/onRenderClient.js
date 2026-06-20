export { onRenderClient }

import { hydrate } from 'ripple'
import { setPageContext } from '../hooks/usePageContext.js'
import { setHydrated } from '../hooks/useHydrated.js'

let hydrated = false

const onRenderClient = async (pageContext) => {
  const { Page } = pageContext
  if (!Page) return

  setPageContext(pageContext)
  const container = document.getElementById('root')
  if (!container) return

  // Hydration — only on the very first page load (SSR)
  if (pageContext.isHydration && container.innerHTML !== '' && !hydrated) {
    try {
      hydrate(Page, { target: container, props: {} })
      hydrated = true
      setHydrated()
      return
    } catch (err) {
      console.warn('[vike-ripple] hydrate failed, falling back to mount:', err)
    }
  }

  // Mount — initial load (if hydrate failed) AND HMR / client navigation
  const { mount } = await import('ripple')
  // Clear container before mount to prevent duplicate content
  // (during HMR the old content is still in the DOM)
  if (!pageContext.isHydration) container.innerHTML = ''
  mount(Page, { target: container, props: {} })
  hydrated = true
  setHydrated()
}
