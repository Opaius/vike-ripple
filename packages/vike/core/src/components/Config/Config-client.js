export { Config };

import { useConfig } from '../../hooks/useConfig/useConfig-client.js';

function Config(props) {
	useConfig()(props);
	return null;
}
