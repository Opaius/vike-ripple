export { usePageContext };
export { setPageContext };

import { track } from 'ripple';

let _clientPageContext = null;

if (typeof window !== 'undefined') {
	_clientPageContext = track(null);
}

function usePageContext() {
	if (typeof window === 'undefined') {
		const storage = globalThis.__ripple_page_context_storage;
		return storage ? storage.getStore() : null;
	}
	return _clientPageContext ? _clientPageContext.value : null;
}

function setPageContext(ctx) {
	if (_clientPageContext) {
		_clientPageContext.value = ctx;
	}
}
