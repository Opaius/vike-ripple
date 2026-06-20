export { onRenderClient }

import { setPageContext } from '../hooks/usePageContext.js'
import { setHydrated } from '../hooks/useHydrated.js'

// tsrx_element — wraps a component fn as a Ripple TSRX element (matches ripple/internal)
const tsrx_element = (fn) => ({
  render: fn,
  [Symbol.for('ripple.element')]: true
})

/** @type {(() => void) | null} */
let dispose = null

const onRenderClient = async (pageContext) => {
  console.log('[vike-ripple] onRenderClient', {
    isHydration: pageContext.isHydration,
    url: pageContext.urlOriginal,
    hasPage: !!pageContext.Page,
    hasLayout: !!pageContext.config?.Layout,
    hasWrapper: !!pageContext.config?.Wrapper,
  })

  const { Page, config } = pageContext
  if (!Page) return

  setPageContext(pageContext)
  const container = document.getElementById('root')
  if (!container) return

  console.log('[vike-ripple] container child count before:', container.childElementCount)

  // ── Build same component tree as SSR ──
  // Apply Layouts (innermost first → outermost last)
  const Layout = config.Layout ?? config.layout
  const Wrapper = config.Wrapper ?? config.wrapper
  let component = Page
  if (Layout) {
    const layouts = Array.isArray(Layout) ? Layout : [Layout]
    for (let i = 0; i < layouts.length; i++) {
      const L = layouts[i]
      const prev = component
      component = (props) => L({ ...props, children: tsrx_element(prev) })
    }
  }
  if (Wrapper) {
    const wrappers = Array.isArray(Wrapper) ? Wrapper : [Wrapper]
    for (const W of wrappers) {
      const prev = component
      component = (props) => W({ ...props, children: tsrx_element(prev) })
    }
  }

  // ── Clean up previous root ──
  if (dispose) {
    console.log('[vike-ripple] disposing previous root')
    dispose()
    dispose = null
  }

  // ── Hydrate or mount ──
  if (pageContext.isHydration && container.innerHTML !== '') {
    const { hydrate } = await import('ripple')
    console.log('[vike-ripple] using hydrate')
    dispose = hydrate(component, { target: container, props: {} })
  } else {
    const { mount } = await import('ripple')
    console.log('[vike-ripple] using mount')
    dispose = mount(component, { target: container, props: {} })
  }
  setHydrated()
  console.log('[vike-ripple] container child count after:', container.childElementCount)
}
