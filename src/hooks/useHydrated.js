export { useHydrated }
export { setHydrated }

import { track } from 'ripple'

let _hydrated = null

if (typeof window !== 'undefined') {
  _hydrated = track(false)
}

function useHydrated() {
  if (_hydrated) {
    return _hydrated.value
  }
  return false
}

function setHydrated() {
  if (_hydrated) {
    _hydrated.value = true
  }
}

