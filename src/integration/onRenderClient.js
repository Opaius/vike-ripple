export { onRenderClient }

import { setPageContext, usePageContext } from '../hooks/usePageContext.js'
import { setHydrated } from '../hooks/useHydrated.js'

// tsrx_element — wraps a component fn as a Ripple TSRX element (matches ripple/internal)
const tsrx_element = (fn) => ({
  render: fn,
  [Symbol.for('ripple.element')]: true
})

/** @type {(() => void) | null} */
let dispose = null
let rootMounted = false

function App() {
  const pageContext = usePageContext()
  if (!pageContext) return null

  const { Page, config } = pageContext
  if (!Page) return null

  const Layout = config.Layout ?? config.layout
  const Wrapper = config.Wrapper ?? config.wrapper
  let component = Page
  if (Layout) {
    const layouts = Array.isArray(Layout) ? Layout : [Layout]
    for (let i = 0; i < layouts.length; i++) {
      const L = layouts[i]
      const prev = component
      component = (props) => L({ ...props, children: tsrx_element(() => prev({})) })
    }
  }
  if (Wrapper) {
    const wrappers = Array.isArray(Wrapper) ? Wrapper : [Wrapper]
    for (const W of wrappers) {
      const prev = component
      component = (props) => W({ ...props, children: tsrx_element(() => prev({})) })
    }
  }

  return component({})
}

const onRenderClient = async (pageContext) => {
  const { Page, config } = pageContext
  if (!Page) return

  // Set context BEFORE mounting/updating so App() reads the correct pageContext.
  // This triggers a Ripple reactive update in App and other components using usePageContext().
  setPageContext(pageContext)

  const container = document.getElementById('root')
  if (!container) return

  const { mount } = await import('ripple')

  if (!rootMounted) {
    // Initial load: mount fresh (always use mount(), not hydrate() —
    // hydrate() crashes Ripple's HMR wrapper when hydrate_node is null).
    dispose = mount(App, { target: container, props: {} })
    rootMounted = true
  }

  // Update document title and lang on page transitions
  const title = config.title
  if (title) {
    document.title = typeof title === 'function' ? title(pageContext) : title
  }
  const lang = config.lang
  if (lang) {
    document.documentElement.lang = lang
  }

  setHydrated()
}

