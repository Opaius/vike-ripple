// https://vike.dev/onRenderHtml
export { onRenderHtml }

import { render, create_ssr_stream } from 'ripple/server'
import { escapeInject, dangerouslySkipEscape } from 'vike/server'

const onRenderHtml = async (pageContext) => {
  const { Page } = pageContext
  if (!Page) throw new Error('No Page')

  const enableStream = !!(pageContext.config.rippleStream ?? pageContext.config.stream)

  if (enableStream) {
    const rippleStream = create_ssr_stream()
    render(Page, { stream: rippleStream.sink }).catch(e => {
      console.error('[ripple] render err:', e?.message)
    })
    return escapeInject`<!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
        <body><div id="root">${rippleStream.stream}</div></body>
      </html>`
  }

  const { head, body, css } = await render(Page, {})

  const cssHtml = css?.size
    ? `<style data-ripple-ssr>${[...css].join('')}<` + `/style>`
    : ''

  return escapeInject`<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        ${dangerouslySkipEscape(head)}
        ${dangerouslySkipEscape(cssHtml)}
      </head>
      <body>
        <div id="root">${dangerouslySkipEscape(body)}</div>
      </body>
    </html>`
}
