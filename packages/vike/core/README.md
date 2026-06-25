# @cioky/vike-core

> ⚠️ **HIGHLY EXPERIMENTAL**

Core Vike + Ripple TS integration. See the [monorepo root](../README.md) for all packages.

Before using this package, read the [quirks & caveats](./docs/quirks.md) — it documents every bug and fix.

## Setup

### 1. Run setup

```sh
npx @cioky/vike-core setup
```

### 2. Configure `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import vike from 'vike/plugin'
import { ripple } from '@ripple-ts/vite-plugin'
import vikeRipple from '@cioky/vike-core'

export default defineConfig({
  optimizeDeps: { exclude: ['ripple'] },
  plugins: [vike(), vikeRipple(), ripple({ excludeRippleExternalModules: true })],
})
```

(Plugin order matters — `vike()` must come first.)

### 3. Add renderer config

Create `renderer/+config.ts`:

```ts
export default {
  extends: ['import:@cioky/vike-core/config:default'],
}
```

## Features

| Feature | Status |
|---|---|
| `.tsrx` page files | ✅ |
| SSR rendering | ✅ |
| Client hydration | ✅ |
| Streaming SSR | ✅ |
| `<head>` tag extraction | ✅ |
| `+Layout.tsrx` / `+Head.tsrx` | ✅ |
| Tailwind CSS v4 (via `@cioky/vike-tailwindcss`) | ✅ |
| Panda CSS (via `@cioky/vike-pandacss`) | ✅ |

## Related

- [`@cioky/vike-tailwindcss`](../@cioky/vike-tailwindcss) — Tailwind `@apply` in `<style>` blocks
- [`@cioky/vike-pandacss`](../@cioky/vike-pandacss) — Panda CSS extraction + `@apply`
- [`create-vike-ripple`](../create-vike-ripple) — Project scaffold
- [`docs/quirks.md`](./docs/quirks.md) — Known issues and fixes
