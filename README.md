# vike-ripple

> ⚠️ **HIGHLY EXPERIMENTAL** — These packages are in early development. APIs may change without notice, parts may not work, and documentation may be incomplete. Use at your own risk.

Monorepo for Vike + Ripple TS integration packages.

| Package | Description |
|---|---|
| [`@vike-ripple/vike-ripple`](./vike-ripple) | SSR, CSR, streaming, head management for Vike + Ripple |
| [`@vike-ripple/tailwindcss`](./vike-ripple-tailwindcss) | Tailwind CSS v4 with `@apply` in `<style>` blocks |

## Why?

Vike (the SSR framework) doesn't know about `.tsrx` files, Ripple's Vite plugin has a cache-miss bug with Vite's `?direct` query parameter, and Tailwind v4 can't resolve `@apply` inside Ripple's component-scoped `<style>` blocks without the Tailwind framework context.

These packages fix all three issues with minimal, automatic patches applied during `npm install`.

## Structure

```
vike-ripple/
  vike-ripple/              — Core Vike + Ripple integration
    src/
      index.js              — Vite plugin (verification)
      setup.js              — CLI setup script (bin: vike-ripple)
  vike-ripple-tailwindcss/  — Tailwind integration
    src/
      index.js              — Vite plugin (verification)
      setup.js              — CLI setup script (bin: vike-ripple-tailwindcss)
```

## Publishing

```sh
cd vike-ripple && npm publish --access public
cd vike-ripple-tailwindcss && npm publish --access public
```
