# vike-ripple — Monorepo

> ⚠️ **HIGHLY EXPERIMENTAL** — These packages are in early development. APIs may change without notice, parts may not work, and documentation may be incomplete. Use at your own risk.

Monorepo for [Vike](https://vike.dev) + [Ripple TS](https://ripple-ts.com) integration packages.

## Packages

| Package | npm | What it does |
|---------|-----|-------------|
| [`@cioky/vike-core`](./packages/vike/core/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/vike-core)](https://www.npmjs.com/package/@cioky/vike-core) | Core: SSR, CSR, streaming, head management, `.tsrx` support, hooks |
| [`@cioky/vike-tailwindcss`](./packages/vike/tailwindcss/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/vike-tailwindcss)](https://www.npmjs.com/package/@cioky/vike-tailwindcss) | Tailwind CSS v4 integration with `@apply` in `<style>` blocks |
| [`@cioky/vike-pandacss`](./packages/vike/pandacss/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/vike-pandacss)](https://www.npmjs.com/package/@cioky/vike-pandacss) | Panda CSS integration — `.tsrx` extraction via `parser:before` hook |
| [`@cioky/vike-create`](./packages/vike/create/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/vike-create)](https://www.npmjs.com/package/@cioky/vike-create) | Project scaffold generator with `--style` and `--cloudflare` flags |
| [`@cioky/ripple-transitions`](./packages/ripple/transitions/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/ripple-transitions)](https://www.npmjs.com/package/@cioky/ripple-transitions) | Transition & animation primitives for Ripple |
| [`@cioky/ripple-query`](./packages/ripple/query/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/ripple-query)](https://www.npmjs.com/package/@cioky/ripple-query) | Reactive query cache — `Tracked`-based, GC'd, SSR-friendly |
| [`@cioky/ripple-query-remult`](./packages/ripple/query-remult/README.md) | [![npm](https://img.shields.io/npm/v/@cioky/ripple-query-remult)](https://www.npmjs.com/package/@cioky/ripple-query-remult) | Remult adapter — auto-key derivation, LiveQuery invalidation |

## Quick Start

```bash
# Create a new project (default: Tailwind CSS)
npx @cioky/vike-create my-app
cd my-app && npm run dev

# With Panda CSS
npx @cioky/vike-create my-app --style pandacss

# With Cloudflare Workers + Remult
npx @cioky/vike-create my-app --style tailwind --cloudflare --remult
```

## Why?

Vike doesn't know about `.tsrx` files, Ripple's Vite plugin has a cache-miss bug with Vite's `?direct` query parameter, and CSS frameworks can't resolve `@apply` inside Ripple's component-scoped `<style>` blocks without a reference layer import.

These packages fix all three issues with minimal, automatic patches applied during `npx <package> setup`.

## Reference

| Document | What's in it |
|----------|-------------|
| [`packages/vike/core/docs/quirks.md`](./packages/vike/core/docs/quirks.md) | Every bug, fix, caveat, and workaround discovered during development |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Project structure, how to make changes, testing |
