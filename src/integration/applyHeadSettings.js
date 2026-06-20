export function applyHeadSettings(headList, target) {
  if (!headList || !Array.isArray(headList)) return
  for (const head of headList) {
    if (typeof head === 'string') {
      target.insertAdjacentHTML('beforeend', head)
    } else if (head instanceof Node) {
      target.appendChild(head.cloneNode(true))
    }
  }
}
