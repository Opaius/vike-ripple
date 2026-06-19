import type { Config } from 'vike/types'

export default {
  prerender: false,
  meta: {
    rippleStream: {
      env: { server: true },
    },
  },
} satisfies Config
