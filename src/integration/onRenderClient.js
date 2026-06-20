export { onRenderClient }

import { hydrate } from 'ripple'
import { setPageContext } from '../hooks/usePageContext.js'
import { setHydrated } from '../hooks/useHydrated.js'

let rendered = false

const onRenderClient = async (pageContext) => {
  const { Page } = pageContext
  if (!Page) return

  setPageContext(pageContext)
  const container = document.getElementById('root')
  if (!container) return

  if (pageContext.isHydration && container.innerHTML !== '') {
    try {
      hydrate(Page, { target: container, props: {} })
      rendered = true
      setHydrated()
    } catch (err) {
      console.warn('[vike-ripple] hydrate failed, falling back to mount:', err)
    }
  }

  if (!rendered) {
    const { mount } = await import('ripple')
    mount(Page, { target: container, props: {} })
    rendered = true
    setHydrated()
  }
}
