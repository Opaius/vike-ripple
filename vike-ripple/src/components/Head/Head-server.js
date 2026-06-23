export { Head };

import { useConfig } from '../../hooks/useConfig/useConfig-server.js';

function Head({ children }) {
	useConfig()({ Head: children });
	return null;
}
