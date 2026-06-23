export { onRenderHtml };

import { render, create_ssr_stream } from 'ripple/server';
import { tsrx_element } from 'ripple/internal/server';
import { escapeInject, dangerouslySkipEscape } from 'vike/server';
import { setPageContext } from '../hooks/usePageContext.js';
import { getHeadSetting } from './getHeadSetting.js';
import { getTagAttributesString } from '../utils/getTagAttributesString.js';
import { callCumulativeHooks } from '../utils/callCumulativeHooks.js';

import { AsyncLocalStorage } from 'node:async_hooks';
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

		const enableStream = !!(
			pageContext.config.stream ?? pageContext.config.rippleStream
		);

		if (enableStream) {
			const rippleStream = create_ssr_stream();
			render(wrappedPage, { stream: rippleStream.sink }).catch((e) => {
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

		const { head, body, css, topLevelError } = await render(wrappedPage, {});
		if (topLevelError) {
			console.error('[vike-ripple] SSR render error:', topLevelError);
			throw topLevelError;
		}

		// Ripple's render() already extracts <head> content into `head` and CSS into `css`
		const cssHtml = css?.size
			? `<style data-ripple-ssr>${[...css].join('')}<` + `/style>`
			: '';

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
          ${dangerouslySkipEscape(headHtmlBegin)}
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
		...(pageContext.config.Head ?? []),
		...(pageContext._configViaHook?.Head ?? [])
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
	return {
		htmlAttributesString: getTagAttributesString(
			pageContext.config.htmlAttributes
		),
		bodyAttributesString: getTagAttributesString(
			pageContext.config.bodyAttributes
		)
	};
}

function getHtmlInjections(pageContext) {
	return {
		headHtmlBegin: (pageContext.config.headHtmlBegin ?? []).join('\n'),
		headHtmlEnd: (pageContext.config.headHtmlEnd ?? []).join('\n'),
		bodyHtmlBegin: (pageContext.config.bodyHtmlBegin ?? []).join('\n'),
		bodyHtmlEnd: (pageContext.config.bodyHtmlEnd ?? []).join('\n')
	};
}
