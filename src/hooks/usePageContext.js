export { usePageContext }
export { setPageContext }

let _pageContext = null

function usePageContext() {
  return _pageContext
}

function setPageContext(ctx) {
  _pageContext = ctx
}
