declare module 'vike-ripple' {
  import type { Plugin } from 'vite'
  const vikeRipple: () => Plugin
  export default vikeRipple
}

declare module 'vike-ripple/config' {
  const config: Record<string, unknown>
  export default config
}
