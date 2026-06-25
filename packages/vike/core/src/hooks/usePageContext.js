export { usePageContext };
export { setPageContext };

import { track } from 'ripple';

/** Tracked signal for the client-side page context. Created lazily inside
 *  usePageContext() where an active component block exists — see ponytail note. */
let _clientPageContext = null;

/** Pending value stored by setPageContext before the signal is created. */
let _pendingPageContext = null;

if (typeof window !== 'undefined') {
	// ponytail: track() needs an active component block (b parameter), which only exists
	// during component render. Module-scope track(null) leaves tracked.b = null,
	// causing set() to crash on null.f access in the schedule-update path.
	// We defer signal creation to usePageContext() where the block is available.
	// Upgrade: if Ripple adds a block-less signal mode, switch to it here.
}

function usePageContext() {
	if (typeof window === 'undefined') {
		const storage = globalThis.__ripple_page_context_storage;
		return storage ? storage.getStore() : null;
	}
	if (!_clientPageContext) {
		_clientPageContext = track(_pendingPageContext);
	}
	return _clientPageContext ? _clientPageContext.value : null;
}

function setPageContext(ctx) {
	_pendingPageContext = ctx;
	if (_clientPageContext) {
		_clientPageContext.value = ctx;
	}
}
