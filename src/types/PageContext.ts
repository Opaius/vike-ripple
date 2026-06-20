import 'vike/types'

declare global {
  namespace Vike {
    interface PageContext {
      _configViaHook?: Record<string, unknown>
      _headAlreadySet?: boolean
      pageHtmlString?: string
    }
  }
}

export type __FakeExport_PageContext = true
