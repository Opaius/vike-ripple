export async function callCumulativeHooks(hooks, ...args) {
  if (!hooks || !Array.isArray(hooks)) return
  for (const hook of hooks) {
    if (typeof hook === 'function') {
      const result = hook(...args)
      if (result && typeof result.then === 'function') await result
    }
  }
}
