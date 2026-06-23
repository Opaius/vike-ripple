# DOX — vike-ripple-pandacss

## Purpose

Panda CSS integration for Ripple TS. Transforms `.tsrx` files for Panda extraction via `parser:before` hook and enables `@apply` in `<style>` blocks by patching with `@layer reset, base, tokens, recipes, utilities;`.

## Ownership

- `src/index.js` — Vite plugin export
- `src/panda-plugin.js` — Panda plugin with `parser:before` hook
- `src/tsrx-to-tsx.js` — `.tsrx` → valid TSX transform for Panda extraction
- `src/setup.js` — CLI setup that replaces tailwind patch with Panda @layer patch

## Local Contracts

- Setup must handle the case where tailwind `TW_PATCH_APPLY` is already present (Case 1 in setup.js)
- Setup runs after `vike-ripple setup` — order is mandatory
- The `tsrx-to-tsx.js` transform strips `<style>` blocks, replaces `@{}` markers, converts reactive declarations, and strips `@if`/`@for`/`@each` directives

## Verification

- Panda CSS codegen: `panda codegen` generates `styled-system/`
- PostCSS plugin: `@pandacss/dev/postcss` processes CSS
- Build: `vite build` succeeds with Panda CSS extraction
