# vike-ripple

> ⚠️ **HIGHLY EXPERIMENTAL** — This package is in early development. APIs may change without notice, parts may not work, and documentation may be incomplete. Use at your own risk.

[Vike](https://vike.dev) integration for [Ripple TS](https://ripple-ts.com) — SSR rendering, client hydration with mount fallback, streaming, `<head>` management, and `.tsrx` page file support.

## Install

```sh
npm install vike-ripple
```

## Setup

### 1. Run setup (patches Vike + Ripple)

```sh
npx vike-ripple setup
```

Or add to your project's `package.json` so it runs automatically after `npm install`:

```json
"scripts": {
  "postinstall": "vike-ripple setup"
}
```

### 2. Configure `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import vike from 'vike/plugin'
import { ripple } from '@ripple-ts/vite-plugin'
import vikeRipple from 'vike-ripple'

export default defineConfig({
  optimizeDeps: { exclude: ['ripple'] },
  plugins: [vikeRipple(), ripple({ excludeRippleExternalModules: true }), vike()],
})
```

### 3. Add renderer config

Create `renderer/+config.ts`:

```ts
export default {
  extends: ['import:vike-ripple/config:default'],
}
```

### 4. Create a page

```tsrx
// pages/index/+Page.tsrx
export function Page(props: {}) @{
  <>
    <head>
      <title>Home</title>
    </head>
    <section class="min-h-screen p-8">
      <h1>Hello, Ripple + Vike!</h1>
    </section>
  </>
}
```

## Features

| Feature | Status |
|---|---|
| `.tsrx` page file support | ✅ |
| SSR rendering | ✅ |
| Client hydration with mount fallback | ✅ |
| Streaming SSR (`rippleStream` config) | ✅ |
| `<head>` tag extraction | ✅ |
| `+Layout.tsrx` support | ✅ |
| `+Head.tsrx` support | ✅ |
| Config: `title`, `description`, `image`, `viewport`, `favicon`, `lang` | ✅ |
| Config: `ssr` toggle, `stream` toggle | ✅ |
| Config: `htmlAttributes`, `bodyAttributes` | ✅ |
| Config: `headHtmlBegin/End`, `bodyHtmlBegin/End` | ✅ |
| Hooks: `onBefore/AfterRenderHtml`, `onBefore/AfterRenderClient` | ✅ |
| `@tailwindcss` integration (via `vike-ripple-tailwindcss`) | ✅ |
| `@apply` in `<style>` blocks (via `vike-ripple-tailwindcss`) | ✅ |
| HMR stability during development | 🟡 |
| TypeScript types for `Vike.Config` / `Vike.PageContext` | 🟡 |
| Production build testing | 🔴 |

## What this does

| Patch | Why |
|---|---|
| **`.tsrx` extension** | Vike doesn't know `.tsrx` is a valid page extension — adds it to `isScriptFile.js` |
| **`?direct` CSS loading** | Vite's SSR module loader appends `?direct` to module IDs; Ripple's `load` hook checks cache with the wrong key |
| **`@apply` support** | Prepends `@import "tailwindcss" layer(reference)` to extracted CSS so `@apply` resolves in `<style>` blocks |

## Known Issues

- **Hydration errors**: Ripple's `hydrate()` may throw `TypeError: Illegal invocation` due to Vite dep optimization. Fixed by `optimizeDeps.exclude: ['ripple']` and the mount fallback in the client renderer.
- **HMR hang**: Editing `.tsrx` files during dev may occasionally cause HMR to hang. Restarting the dev server resolves it.
- **`</style>` in template literals**: If a `.tsx` file contains `</style>` inside a JavaScript string, the Tailwind Oxide scanner may emit a `CssSyntaxError`. Workaround: break the literal with string concatenation: `"<" + "/style>"`. See [tailwindcss#20000](https://github.com/tailwindlabs/tailwindcss/issues/20000).
