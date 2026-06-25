# @cioky/vike-pandacss

> ⚠️ **HIGHLY EXPERIMENTAL** — This package is in early development. APIs may change without notice, parts may not work, and documentation may be incomplete. Use at your own risk.

[Panda CSS](https://panda-css.com) integration for [Ripple TS](https://ripple-ts.com) — transforms `.tsrx` files for Panda extraction and enables `@apply` in `<style>` blocks.

Part of the [vike-ripple monorepo](https://github.com/Opaius/vike-ripple).

## Quick Start

```bash
npx @cioky/vike-create my-app --style pandacss
cd my-app && npm run dev
```

## Manual Install

```sh
npm install @cioky/vike-pandacss
```

## Setup

Two setup scripts must run **in order**:

```bash
npx @cioky/vike-core setup          # core patches (.tsrx, server isolation, etc.)
npx @cioky/vike-pandacss setup  # replaces tailwind @apply with Panda @layer
```

## Usage

### Vite plugin

```ts
// vite.config.ts
import vikeRipplePandacss from '@cioky/vike-pandacss'

export default defineConfig({
  css: { postcss: './postcss.config.js' },
  plugins: [
    vikeRipplePandacss(),
  ],
})
```

### PostCSS config

```js
// postcss.config.js
export default { plugins: { '@pandacss/dev/postcss': {} } }
```

### Panda CSS plugin

```ts
// panda.config.ts
import { pluginRipple } from '@cioky/vike-pandacss/panda-plugin'

export default defineConfig({
  plugins: [pluginRipple()],
})
```

The `pluginRipple()` implements Panda's `parser:before` hook to transform `.tsrx` content into valid TSX before Panda's ts-morph extracts `css()`/`cva()`/`sva()` calls.

## How it works

- **`parser:before` hook**: Strips Ripple's `@if`/`@for`/`@each` directives, `@{}` markers, and `<style>` blocks from `.tsrx` files so Panda's extraction engine can parse the remaining TSX.
- **`@apply` patch**: Prepends `@layer reset, base, tokens, recipes, utilities;` to extracted CSS from `<style>` blocks so Panda CSS `@apply` directives resolve at build time.

## Related Packages

- [`@cioky/vike-core`](https://github.com/Opaius/vike-ripple/tree/main/vike-ripple) — Core Vike + Ripple integration
- [`@cioky/vike-tailwindcss`](https://github.com/Opaius/vike-ripple/tree/main/vike-ripple-tailwindcss) — Tailwind CSS alternative
- [`@cioky/vike-create`](https://github.com/Opaius/vike-ripple/tree/main/create-vike-ripple) — Project scaffold
