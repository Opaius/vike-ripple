export { useHydrated }
export { setHydrated }

let _hydrated = false

function useHydrated() { return _hydrated }
function setHydrated() { _hydrated = true }
