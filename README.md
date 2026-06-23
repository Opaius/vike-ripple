# vike-ripple — Monorepo

> ⚠️ **HIGHLY EXPERIMENTAL** — These packages are in early development. APIs may change without notice, parts may not work, and documentation may be incomplete. Use at your own risk.

Monorepo for [Vike](https://vike.dev) + [Ripple TS](https://ripple-ts.com) integration packages.

## Packages

Each package has its own `README.md` with full install, setup, and usage instructions.

| Package | npm | What it does |
|---------|-----|-------------|
| [`vike-ripple`](./vike-ripple/README.md) | [![npm](https://img.shields.io/npm/v/vike-ripple)](https://www.npmjs.com/package/vike-ripple) | Core: SSR, CSR, streaming, head management, `.tsrx` support, hooks |
| [`vike-ripple-tailwindcss`](./vike-ripple-tailwindcss/README.md) | [![npm](https://img.shields.io/npm/v/vike-ripple-tailwindcss)](https://www.npmjs.com/package/vike-ripple-tailwindcss) | Tailwind CSS v4 integration with `@apply` in `<style>` blocks |
| [`vike-ripple-pandacss`](./vike-ripple-pandacss/README.md) | [![npm](https://img.shields.io/npm/v/vike-ripple-pandacss)](https://www.npmjs.com/package/vike-ripple-pandacss) | Panda CSS integration — `.tsrx` extraction via `parser:before` hook |
| [`create-vike-ripple`](./create-vike-ripple/README.md) | [![npm](https://img.shields.io/npm/v/create-vike-ripple)](https://www.npmjs.com/package/create-vike-ripple) | Project scaffold generator with `--style` and `--cloudflare` flags |

## Quick Start

```bash
# Create a new project (default: Tailwind CSS)
npx create-vike-ripple my-app
cd my-app && npm run dev

# With Panda CSS
npx create-vike-ripple my-app --style pandacss

# With Cloudflare Workers + Remult
npx create-vike-ripple my-app --style tailwind --cloudflare --remult
```

## Why?

Vike doesn't know about `.tsrx` files, Ripple's Vite plugin has a cache-miss bug with Vite's `?direct` query parameter, and CSS frameworks can't resolve `@apply` inside Ripple's component-scoped `<style>` blocks without a reference layer import.

These packages fix all three issues with minimal, automatic patches applied during `npx <package> setup`.

## Reference

| Document | What's in it |
|----------|-------------|
| [`vike-ripple/docs/quirks.md`](./vike-ripple/docs/quirks.md) | Every bug, fix, caveat, and workaround discovered during development |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Project structure, how to make changes, testing |
| [`vike-ripple/README.md`](./vike-ripple/README.md) | Core package install & setup |
| [`vike-ripple-tailwindcss/README.md`](./vike-ripple-tailwindcss/README.md) | Tailwind CSS integration docs |
| [`vike-ripple-pandacss/README.md`](./vike-ripple-pandacss/README.md) | Panda CSS integration docs |
| [`create-vike-ripple/README.md`](./create-vike-ripple/README.md) | Scaffold generator docs |
