# @vike-ripple/vike-ripple

[Vike](https://vike.dev) integration for [Ripple TS](https://ripple-ts.com) — SSR rendering, client hydration with mount fallback, streaming, `<head>` management, and `.tsrx` page file support.

## Install

```sh
npm install @vike-ripple/vike-ripple
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

### 2. Add plugin to `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import vike from 'vike/plugin'
import { ripple } from '@ripple-ts/vite-plugin'
import vikeRipple from '@vike-ripple/vike-ripple'

export default defineConfig({
  optimizeDeps: {
    exclude: ['ripple'],
  },
  plugins: [
    vikeRipple(),
    ripple({ excludeRippleExternalModules: true }),
    vike(),
  ],
})
> **Why `optimizeDeps.exclude: ['ripple']`?** Ripple uses module-scoped variables (`first_child_getter`) shared between `hydrate()` and DOM traversal functions. Vite's dependency optimization splits these into separate bundles, breaking the scope sharing and causing `TypeError: Cannot read properties of undefined (reading 'call')` at `get_first_child` during hydration. Excluding `ripple` from optimization ensures all Ripple internals stay in one module scope.

### 3. Add renderer files

Copy from `node_modules/@vike-ripple/vike-ripple/src/renderer/` to your project's `renderer/`:

```
renderer/
  +config.ts
  +onRenderHtml.tsx
  +onRenderClient.tsx
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

## What this does

| Patch | Why |
|---|---|
| **`.tsrx` extension** | Vike doesn't know `.tsrx` is a valid page extension — adds it to `isScriptFile.js` |
| **`?direct` CSS loading** | Vite's SSR module loader appends `?direct` to module IDs; Ripple's `load` hook checks cache with the wrong key |
| **Hydrate → mount fallback** | Ripple's `hydrate` can mismatch when `<title>` or `<head>` content is extracted during SSR but missing from the client DOM; falls back to `mount` gracefully |

## API

### `vikeRipple()`

Vite plugin. Must be placed before `ripple()` in the plugins array, with `enforce: 'pre'` behavior.

### Renderer files

- **`+onRenderHtml.tsx`** — SSR via `ripple/server`'s `render()`, extracts `<head>`, `<body>`, and CSS, injects them into Vike's HTML template. Supports streaming via `rippleStream` config.
- **`+onRenderClient.tsx`** — Hydrates with `hydrate()` from `ripple`, falls back to `mount()` on error. Imports `tailwind.css` if present.
- **`+config.ts`** — Disables prerender by default, registers `rippleStream` meta config.
