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
  const { Page, config } = pageContext
  if (!Page) return

  setPageContext(pageContext)
  const container = document.getElementById('root')
  if (!container) return

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
    dispose()
    dispose = null
  }

  // ── Hydrate or mount ──
  // Hydrate preserves SSR HTML; mount clears and re-renders.
  // mount() is the stable fallback when hydration fails (e.g. during HMR reload).
  const { mount, hydrate } = await import('ripple')

  if (pageContext.isHydration && container.innerHTML !== '') {
    try {
      dispose = hydrate(component, { target: container, props: {} })
      setHydrated()
      return
    } catch (err) {
      console.warn('[vike-ripple] hydrate failed, falling back to mount:', err)
    }
  }

  // mount() clears container internally (target.textContent = '')
  dispose = mount(component, { target: container, props: {} })
  setHydrated()
}
