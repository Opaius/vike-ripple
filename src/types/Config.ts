import 'vike/types'

declare global {
  namespace Vike {
    interface Config {
      Head?: unknown[]
      Layout?: unknown[]
      title?: string | null
      description?: string | null
      image?: string | null
      viewport?: 'responsive' | number | null
      favicon?: string | null
      lang?: string | null
      ssr?: boolean
      stream?: boolean
      rippleStream?: boolean
      Wrapper?: unknown[]
      Loading?: unknown
      onBeforeRenderHtml?: ((pageContext: unknown) => void | Promise<void>)[]
      onAfterRenderHtml?: ((pageContext: unknown) => void | Promise<void>)[]
      onBeforeRenderClient?: ((pageContext: unknown) => void | Promise<void>)[]
      onAfterRenderClient?: ((pageContext: unknown) => void | Promise<void>)[]
      bodyHtmlBegin?: string[]
      bodyHtmlEnd?: string[]
      headHtmlBegin?: string[]
      headHtmlEnd?: string[]
      htmlAttributes?: Record<string, string | boolean>
      bodyAttributes?: Record<string, string | boolean>
    }
  }
}

export type __FakeExport_Config = true
