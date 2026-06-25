export { useConfig };

import { getPageContext } from 'vike/getPageContext';
import { usePageContext } from '../usePageContext.js';

function useConfig() {
	// Vike hook
	let pageContext = getPageContext({ asyncHook: false });
	if (pageContext) {
		return (config) => {
			pageContext._configViaHook ??= {};
			Object.assign(pageContext._configViaHook, config);
		};
	}

	// Component
	pageContext = usePageContext();
	return (config) => {
		if (pageContext && !pageContext._headAlreadySet) {
			pageContext._configViaHook ??= {};
			Object.assign(pageContext._configViaHook, config);
		}
	};
}
