export { getPageElement }

import { getHeadSetting } from './getHeadSetting.js'

function getPageElement(pageContext) {
  const { Page } = pageContext
  if (!Page) {
    return { page: null, pageElement: null }
  }

  const Layout = pageContext.config.Layout
  const Wrapper = pageContext.config.Wrapper

  let page = Page

  if (Layout) {
    const layouts = Array.isArray(Layout) ? Layout : [Layout]
    for (let i = layouts.length - 1; i >= 0; i--) {
      const LayoutComponent = layouts[i]
      page = function NestedPage(props) { return LayoutComponent({ ...props, children: page }) }
    }
  }

  if (Wrapper) {
    const wrappers = Array.isArray(Wrapper) ? Wrapper : [Wrapper]
    for (const W of wrappers) {
      page = function WrappedPage(props) { return W({ ...props, children: page }) }
    }
  }

  return { page, pageElement: page }
}
