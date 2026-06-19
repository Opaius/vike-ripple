// https://vike.dev/onRenderClient
export { onRenderClient }

import { hydrate } from 'ripple'

let rendered = false

const onRenderClient = async (pageContext) => {
  const { Page } = pageContext
  if (!Page) return

  const container = document.getElementById('root')
  if (!container) return

  if (pageContext.isHydration && container.innerHTML !== '') {
    try {
      hydrate(Page, { target: container, props: {} })
      rendered = true
    } catch (err) {
      console.warn('[ripple] hydrate failed, falling back to mount:', err)
    }
  }

  if (!rendered) {
    const { mount } = await import('ripple')
    mount(Page, { target: container, props: {} })
    rendered = true
  }
}
