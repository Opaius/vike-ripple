export { setHydrated, useHydrated };

import { track } from 'ripple';

// Lazy-initialized: created on first useHydrated() call, which runs inside
// a component render where active_block is set. Module-scope track() would
// leave tracked.b === null, crashing set() → "Cannot read properties of null (reading 'f')".
let _hydrated = null;

function useHydrated() {
	if (typeof window === 'undefined') return false;
	if (_hydrated === null) {
		_hydrated = track(false);
	}
	return _hydrated ? _hydrated.value : false;
}

function setHydrated() {
	if (_hydrated) {
		_hydrated.value = true;
	}
}
