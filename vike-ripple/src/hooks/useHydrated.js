export { useHydrated };
export { setHydrated };

import { track } from 'ripple';

let _hydrated = null;

if (typeof window !== 'undefined') {
	_hydrated = track(false);
}

function useHydrated() {
	if (typeof window === 'undefined') return false;
	return _hydrated ? _hydrated.value : false;
}

function setHydrated() {
	if (_hydrated) {
		_hydrated.value = true;
	}
}
