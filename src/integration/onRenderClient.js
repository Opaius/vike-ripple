// https://vike.dev/onRenderClient
export { onRenderClient }

import { hydrate } from 'ripple'
import { getHeadSetting } from './getHeadSetting.js'
import { applyHeadSettings } from './applyHeadSettings.js'
import { callCumulativeHooks } from '../utils/callCumulativeHooks.js'

let rendered = false

const onRenderClient = async (pageContext) => {
  await callCumulativeHooks(pageContext.config.onBeforeRenderClient, pageContext)

  const container = document.getElementById('root')
  if (!container) return

  pageContext._headAlreadySet = pageContext.isHydration

  if (pageContext.isHydration && container.innerHTML !== '') {
    try {
      hydratePage(pageContext, container)
      rendered = true
    } catch (err) {
      console.warn('[vike-ripple] hydrate failed, falling back to mount:', err)
    }
  }

  if (!rendered) {
    mountPage(pageContext, container)
    rendered = true
  }

  updateHead(pageContext)

  await callCumulativeHooks(pageContext.config.onAfterRenderClient, pageContext)
}

function hydratePage(pageContext, container) {
  hydrate(pageContext.Page, { target: container, props: {} })
}

async function mountPage(pageContext, container) {
  const { mount } = await import('ripple')
  mount(pageContext.Page, { target: container, props: {} })
}

function updateHead(pageContext) {
  if (pageContext._headAlreadySet) return

  const title = getHeadSetting('title', pageContext)
  if (title && document.title !== title) {
    document.title = title
  }

  const lang = getHeadSetting('lang', pageContext)
  if (lang) {
    document.documentElement.lang = lang
  }

  applyHeadSettings(pageContext.config.Head, document.head)
  applyHeadSettings(pageContext._configViaHook?.Head, document.head)
}
