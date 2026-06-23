// ssrEffect inlined to avoid import resolution issues during config loading
function ssrEffect({ configDefinedAt, configValue }) {
	if (typeof configValue !== 'boolean')
		throw new Error(`${configDefinedAt} should be a boolean`);
	return {
		meta: {
			Page: { env: { client: true, server: configValue !== false } },
			Layout: { env: { client: true, server: configValue !== false } },
			Wrapper: { env: { client: true, server: configValue !== false } }
		}
	};
}

const config = {
	name: 'vike-ripple',
	require: { vike: '>=0.4.250' },

	onRenderHtml:
		'import:vike-ripple/__internal/integration/onRenderHtml:onRenderHtml',
	onRenderClient:
		'import:vike-ripple/__internal/integration/onRenderClient:onRenderClient',

	clientRouting: true,
	hydrationCanBeAborted: true,

	passToClient: ['_configViaHook'],

	meta: {
		Head: { env: { server: true }, cumulative: true },
		Layout: { env: { server: true, client: true }, cumulative: true },
		Wrapper: { env: { server: true, client: true }, cumulative: true },
		title: { env: { server: true, client: true } },
		description: { env: { server: true } },
		image: { env: { server: true } },
		viewport: { env: { server: true } },
		favicon: { env: { server: true }, global: true },
		lang: { env: { server: true, client: true } },
		ssr: { env: { config: true }, effect: ssrEffect },
		stream: { env: { server: true }, cumulative: true },
		onBeforeRenderHtml: { env: { server: true }, cumulative: true },
		onAfterRenderHtml: { env: { server: true }, cumulative: true },
		onBeforeRenderClient: { env: { client: true }, cumulative: true },
		onAfterRenderClient: { env: { client: true }, cumulative: true },
		bodyHtmlBegin: { env: { server: true }, cumulative: true, global: true },
		bodyHtmlEnd: { env: { server: true }, cumulative: true, global: true },
		headHtmlBegin: { env: { server: true }, cumulative: true, global: true },
		headHtmlEnd: { env: { server: true }, cumulative: true, global: true },
		htmlAttributes: { env: { server: true }, global: true, cumulative: true },
		bodyAttributes: { env: { server: true }, global: true, cumulative: true }
	}
};

export default config;
