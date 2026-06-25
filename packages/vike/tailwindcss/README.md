# @cioky/vike-tailwindcss

> ⚠️ **HIGHLY EXPERIMENTAL** — This package is in early development. APIs may change without notice, parts may not work, and documentation may be incomplete. Use at your own risk.

[Tailwind CSS v4](https://tailwindcss.com) integration for [Ripple TS](https://ripple-ts.com) — enables `@apply` inside Ripple `<style>` blocks with full theme/utility resolution.

Part of the [vike-ripple monorepo](https://github.com/Opaius/vike-ripple).

## Quick Start

```bash
npx create-vike-ripple my-app --style tailwind
cd my-app && npm run dev
```

## Manual Install

```sh
npm install @cioky/vike-tailwindcss
```

### 1. Run setup

```sh
npx @cioky/vike-tailwindcss setup
```

### 2. Add plugin to `vite.config.ts`

```ts
import vikeRippleTailwindcss from '@cioky/vike-tailwindcss'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vikeRipple(),
    ripple({ excludeRippleExternalModules: true }),
    vike(),
    vikeRippleTailwindcss(),
    tailwindcss(),
  ],
})
```

### 3. Add CSS entry point

Create `src/tailwind.css`:

```css
@import "tailwindcss";
```

Import it in your Layout or page:

```tsx
import '../src/tailwind.css'
```

## Usage

```tsrx
<style>
  .my-button {
    @apply bg-blue-500 text-white font-bold py-2 px-4 rounded;
  }
</style>
```

## How it works

Ripple extracts CSS from `<style>` blocks and emits it as a virtual module. This plugin patches `@ripple-ts/vite-plugin` to prepend `@import "tailwindcss" layer(reference)` to the extracted CSS, making Tailwind utilities available for `@apply` without generating duplicate CSS output.

## Known Issues

- **HMR hang**: Editing files with `@apply` during dev may occasionally cause HMR to hang.
- **`</style>` in template literals**: If a file contains `</style>` inside a JavaScript string, the Tailwind Oxide scanner may emit a `CssSyntaxError`. Workaround: break the literal.

## Related Packages
- [`@cioky/vike-core`](https://github.com/Opaius/vike-ripple/tree/main/vike-ripple) — Core Vike + Ripple integration
- [`vike-ripple-pandacss`](https://github.com/Opaius/vike-ripple/tree/main/vike-ripple-pandacss) — Panda CSS alternative
- [`create-vike-ripple`](https://github.com/Opaius/vike-ripple/tree/main/create-vike-ripple) — Project scaffold
