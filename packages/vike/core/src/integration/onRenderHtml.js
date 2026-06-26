export { onRenderHtml };

import { AsyncLocalStorage } from 'node:async_hooks';
import { tsrx_element } from 'ripple/internal/server';
import { create_ssr_stream, render } from 'ripple/server';
import { dangerouslySkipEscape, escapeInject } from 'vike/server';
import { setPageContext } from '../hooks/usePageContext.js';
import { callCumulativeHooks } from '../utils/callCumulativeHooks.js';
import { getTagAttributesString } from '../utils/getTagAttributesString.js';
import { getHeadSetting } from './getHeadSetting.js';

globalThis.__rq_cache_storage ??= new AsyncLocalStorage();
globalThis.__ripple_page_context_storage ??= new AsyncLocalStorage();

const onRenderHtml = async (pageContext) => {
	return globalThis.__ripple_page_context_storage.run(pageContext, async () => {
		const { Page } = pageContext;
		if (!Page) throw new Error('No Page');

		await callCumulativeHooks(
			pageContext.config.onBeforeRenderHtml,
			pageContext
		);

		setPageContext(pageContext);

		const headHtml = getHeadHtml(pageContext);
		const { headHtmlBegin, headHtmlEnd, bodyHtmlBegin, bodyHtmlEnd } =
			getHtmlInjections(pageContext);
		const { htmlAttributesString, bodyAttributesString } =
			getTagAttributes(pageContext);

		// Wrap in Layout(s) + Wrapper(s)
		let wrappedPage = Page;
		const Layout = pageContext.config.Layout;
		const Wrapper = pageContext.config.Wrapper;
		if (Layout) {
			const layouts = Array.isArray(Layout) ? Layout : [Layout];
			for (let i = 0; i < layouts.length; i++) {
				const L = layouts[i];
				const prev = wrappedPage;
				wrappedPage = (props) =>
					L({ ...props, children: tsrx_element(() => prev({})) });
			}
		}
		if (Wrapper) {
			const wrappers = Array.isArray(Wrapper) ? Wrapper : [Wrapper];
			for (const W of wrappers) {
				const prev = wrappedPage;
				wrappedPage = (props) =>
					W({ ...props, children: tsrx_element(() => prev({})) });
			}
		}

		// ponytail: per-request cache via AsyncLocalStorage.
		// Each SSR render gets a fresh Map → no cross-request contamination.
		return globalThis.__rq_cache_storage.run(new Map(), async () => {
			const enableStream = !!(
				pageContext.config.stream ?? pageContext.config.rippleStream
			);

			if (enableStream) {
				const rippleStream = create_ssr_stream();
				render(wrappedPage, {
					stream: rippleStream.sink,
					closeStream: false
				})
					.then(async () => {
						try {
							const mod = await import('@cioky/ripple-query');
							if (typeof mod.flushPending === 'function')
								await mod.flushPending();
							if (typeof mod.serializeCache === 'function') {
								const tag = mod.serializeCache();
								if (tag) rippleStream.sink.push(tag);
							}
						} catch {}
						rippleStream.sink.close();
					})
					.catch((e) => {
						console.error('[ripple] render err:', e?.message);
					});
				return escapeInject`<!DOCTYPE html>
        <html${dangerouslySkipEscape(htmlAttributesString)}>
          <head>
            <meta charset="UTF-8" />
            ${dangerouslySkipEscape(headHtmlBegin)}
            ${dangerouslySkipEscape(headHtml)}
            ${dangerouslySkipEscape(headHtmlEnd)}
          </head>
          <body${dangerouslySkipEscape(bodyAttributesString)}>
            ${dangerouslySkipEscape(bodyHtmlBegin)}
            <div id="root">${rippleStream.stream}</div>
            ${dangerouslySkipEscape(bodyHtmlEnd)}
          </body>
        </html>`;
			}

			let renderFn = () => render(wrappedPage, {});
			if (typeof pageContext.ssrContextWrapper === 'function') {
				renderFn = () =>
					pageContext.ssrContextWrapper(() => render(wrappedPage, {}));
			}
			const { head, body, css, topLevelError } = await renderFn();
			if (topLevelError) {
				console.error('[@cioky/vike-core] SSR render error:', topLevelError);
				throw topLevelError;
			}

			const cssHtml = css?.size
				? `<style data-ripple-ssr>${[...css].join('')}</style>`
				: '';

			// Serialize query cache from the per-request ALS store
			let cacheTag = '';
			try {
				const mod = await import('@cioky/ripple-query');
				if (typeof mod.flushPending === 'function') await mod.flushPending();
				if (typeof mod.serializeCache === 'function') {
					cacheTag = mod.serializeCache();
				}
			} catch {}
			pageContext.pageHtmlString = body;
			await callCumulativeHooks(
				pageContext.config.onAfterRenderHtml,
				pageContext
			);

			return escapeInject`<!DOCTYPE html>
      <html${dangerouslySkipEscape(htmlAttributesString)}>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          ${dangerouslySkipEscape(cacheTag)}
          ${dangerouslySkipEscape(head)}
          ${dangerouslySkipEscape(cssHtml)}
          ${dangerouslySkipEscape(headHtml)}
          ${dangerouslySkipEscape(headHtmlEnd)}
        </head>
          <body${dangerouslySkipEscape(bodyAttributesString)}>
          ${dangerouslySkipEscape(bodyHtmlBegin)}
          <div id="root">${dangerouslySkipEscape(body)}</div>
          ${dangerouslySkipEscape(bodyHtmlEnd)}
        </body>
      </html>`;
		});
	});
};

function getHeadHtml(pageContext) {
	const favicon = getHeadSetting('favicon', pageContext);
	const title = getHeadSetting('title', pageContext);
	const description = getHeadSetting('description', pageContext);
	const image = getHeadSetting('image', pageContext);

	const parts = [];
	if (favicon) parts.push(`<link rel="icon" href="${favicon}" />`);
	if (title) parts.push(`<title>${title}</title>`);
	if (description)
		parts.push(`<meta name="description" content="${description}" />`);
	if (image) parts.push(`<meta property="og:image" content="${image}">`);
	const viewportTag = getViewportTag(getHeadSetting('viewport', pageContext));
	if (viewportTag) parts.push(viewportTag);
	const headElements = [
		getHeadSetting('head', pageContext),
		getHeadSetting('script', pageContext)
	]
		.filter(Boolean)
		.map((h) => (typeof h === 'function' ? h(pageContext) : h))
		.join('\n');
	if (headElements) parts.push(headElements);
	return parts.join('\n');
}

function getViewportTag(viewport) {
	if (!viewport && viewport !== 0) return '';
	if (viewport === 'responsive')
		return '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';
	if (typeof viewport === 'number')
		return `<meta name="viewport" content="width=${viewport}" />`;
	return '';
}

function getTagAttributes(pageContext) {
	const htmlAttributes = getHeadSetting('htmlAttributes', pageContext) || {};
	const bodyAttributes = getHeadSetting('bodyAttributes', pageContext) || {};
	return {
		htmlAttributesString: getTagAttributesString(htmlAttributes),
		bodyAttributesString: getTagAttributesString(bodyAttributes)
	};
}

function getHtmlInjections(pageContext) {
	return {
		headHtmlBegin: getHeadSetting('headHtmlBegin', pageContext) || '',
		headHtmlEnd: getHeadSetting('headHtmlEnd', pageContext) || '',
		bodyHtmlBegin: getHeadSetting('bodyHtmlBegin', pageContext) || '',
		bodyHtmlEnd: getHeadSetting('bodyHtmlEnd', pageContext) || ''
	};
}
