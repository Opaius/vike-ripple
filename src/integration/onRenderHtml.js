export { onRenderHtml }

import { render, create_ssr_stream } from 'ripple/server'
import { escapeInject, dangerouslySkipEscape } from 'vike/server'


import { getHeadSetting } from './getHeadSetting.js'
import { callCumulativeHooks } from '../utils/callCumulativeHooks.js'
import { getTagAttributesString } from '../utils/getTagAttributesString.js'

const onRenderHtml = async (pageContext) => {
  const pageContext2 = pageContext
  const { Page } = pageContext2
  if (!Page) throw new Error('No Page')

  await callCumulativeHooks(pageContext2.config.onBeforeRenderHtml, pageContext2)

  const headHtml = getHeadHtml(pageContext2)
  const { headHtmlBegin, headHtmlEnd, bodyHtmlBegin, bodyHtmlEnd } = await getHtmlInjections(pageContext2)
  const { htmlAttributesString, bodyAttributesString } = getTagAttributes(pageContext2)
  const enableStream = !!(pageContext2.config.stream ?? pageContext2.config.rippleStream)

  if (enableStream) {
    const rippleStream = create_ssr_stream()
    render(Page, { stream: rippleStream.sink }).catch(e => {
      console.error('[ripple] render err:', e?.message)
    })
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
      </html>`
  }

  const { head, body, css } = await render(Page, {})

  const cssHtml = css?.size
    ? `<style data-ripple-ssr>${[...css].join('')}<` + `/style>`
    : ''

  const pageHtml = `<div id="root">${body}${cssHtml}</div>`

  pageContext2.pageHtmlString = body
  await callCumulativeHooks(pageContext2.config.onAfterRenderHtml, pageContext2)

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
    </html>`
}

function getHeadHtml(pageContext) {
  const favicon = getHeadSetting('favicon', pageContext)
  const title = getHeadSetting('title', pageContext)
  const description = getHeadSetting('description', pageContext)
  const image = getHeadSetting('image', pageContext)

  const faviconTag = !favicon ? '' : `<link rel="icon" href="${favicon}" />`
  const titleTags = !title ? '' : `<title>${title}</title><meta property="og:title" content="${title}" />`
  const descriptionTags = !description
    ? ''
    : `<meta name="description" content="${description}" /><meta property="og:description" content="${description}" />`
  const imageTags = !image
    ? ''
    : `<meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image">`
  const viewportTag = getViewportTag(getHeadSetting('viewport', pageContext))
  const langAttr = getHeadSetting('lang', pageContext)
  const headElementsHtml = [
    ...(pageContext.config.Head ?? []),
    ...(pageContext._configViaHook?.Head ?? []),
  ]
    .filter(Boolean)
    .map(head => (typeof head === 'function' ? head(pageContext) : head))
    .join('\n')

  return `${titleTags}${viewportTag}${headElementsHtml}${faviconTag}${descriptionTags}${imageTags}`
}

export function getViewportTag(viewport) {
  if (viewport === null || viewport === undefined) return ''
  if (viewport === 'responsive') return '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
  if (typeof viewport === 'number') return `<meta name="viewport" content="width=${viewport}" />`
  return '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
}

function getTagAttributes(pageContext) {
  const htmlAttributesString = getTagAttributesString(pageContext.config.htmlAttributes)
  const bodyAttributesString = getTagAttributesString(pageContext.config.bodyAttributes)
  return { htmlAttributesString, bodyAttributesString }
}

async function getHtmlInjections(pageContext) {
  const headHtmlBegin = (pageContext.config.headHtmlBegin ?? []).join('\n')
  const headHtmlEnd = (pageContext.config.headHtmlEnd ?? []).join('\n')
  const bodyHtmlBegin = (pageContext.config.bodyHtmlBegin ?? []).join('\n')
  const bodyHtmlEnd = (pageContext.config.bodyHtmlEnd ?? []).join('\n')
  return { headHtmlBegin, headHtmlEnd, bodyHtmlBegin, bodyHtmlEnd }
}
