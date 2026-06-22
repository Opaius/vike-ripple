export { useHydrated }
export { setHydrated }

import { track, effect } from 'ripple'

let _isHydrated = false
const _listeners = new Set()

function useHydrated() {
  if (_isHydrated) return true

  const hydrated = track(false)

  effect(() => {
    _listeners.add(hydrated)
    return () => {
      _listeners.delete(hydrated)
    }
  })

  return hydrated.value
}

function setHydrated() {
  _isHydrated = true
  for (const signal of _listeners) {
    signal.value = true
  }
  _listeners.clear()
}

