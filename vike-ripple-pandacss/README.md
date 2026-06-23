# vike-ripple-pandacss

Panda CSS integration for Ripple TS — transforms `.tsrx` files for Panda extraction and enables `@apply` in `<style>` blocks.

## Install

```bash
npm install vike-ripple-pandacss
```

## Setup

Two setup scripts must run **in order**:

```bash
# Step 1: vike-ripple core setup (patches .tsrx support, server isolation, etc.)
npx vike-ripple setup

# Step 2: pandacss setup (replaces the @import "tailwindcss" patch with @layer reset, base, ...)
npx vike-ripple-pandacss setup
```

The `vike-ripple-pandacss setup` script patches `@ripple-ts/vite-plugin` to emit `@layer` directives before style blocks, so Panda CSS `@apply` resolves correctly.

## Usage

Add the Vite plugin:

```ts
// vite.config.ts
import vikeRipplePandacss from 'vike-ripple-pandacss'

export default defineConfig({
  css: { postcss: './postcss.config.js' },
  plugins: [
    vikeRipplePandacss(),
  ],
})
```

Add the Panda CSS plugin in `panda.config.ts`:

```ts
import { pluginRipple } from 'vike-ripple-pandacss/panda-plugin'

export default defineConfig({
  plugins: [pluginRipple()],
})
```

The `pluginRipple()` implements Panda's `parser:before` hook to transform `.tsrx` content into valid TSX before Panda's ts-morph extracts `css()`/`cva()`/`sva()` calls.

See the [main repo](https://github.com/Opaius/vike-ripple) for full documentation.
