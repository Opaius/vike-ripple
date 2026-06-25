export { ClientOnly };

import { useHydrated } from '../hooks/useHydrated.js';

function ClientOnly({ children, fallback }) {
	return useHydrated() ? children : (fallback ?? null);
}
