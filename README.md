# vike-ripple

> Vike + Ripple TS integration toolchain — SSR, streaming, CSS framework plugins, reactive query cache, and Remult realtime adapter.

[![npm](https://img.shields.io/badge/npm-@cioky/vike--core-CB3837?logo=npm)](https://www.npmjs.com/package/@cioky/vike-core)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## Packages

This monorepo contains seven packages under the `@cioky` scope, grouped by domain.

### Vike SSR integration

| Package | What it does | Setup |
|---|---|---|
| [`@cioky/vike-core`](./packages/vike/core) | SSR, CSR, streaming, `<head>` management, `.tsrx` support, hooks | `npx @cioky/vike-core setup` |
| [`@cioky/vike-tailwindcss`](./packages/vike/tailwindcss) | Tailwind CSS v4 — `@apply` in `<style>` blocks | `npx @cioky/vike-tailwindcss setup` |
| [`@cioky/vike-pandacss`](./packages/vike/pandacss) | Panda CSS — `.tsrx` extraction via `parser:before` hook | `npx @cioky/vike-pandacss setup` |
| [`@cioky/vike-create`](./packages/vike/create) | Project scaffold CLI | `npx @cioky/vike-create my-app` |

### Ripple ecosystem

| Package | What it does |
|---|---|
| [`@cioky/ripple-transitions`](./packages/ripple/transitions) | Transition & animation primitives (FLIP, motion, slide, spring, stagger) |
| [`@cioky/ripple-query`](./packages/ripple/query) | Reactive query cache — `Tracked`-based, GC-collected, SSR-friendly |
| [`@cioky/ripple-query-remult`](./packages/ripple/query-remult) | Remult adapter — auto-key derivation, LiveQuery invalidation via SSE |

### Remult realtime

| Package | What it does |
|---|---|
| [`remult-partykit`](./packages/remult/partykit) | Real-time sync for Remult using Cloudflare Durable Objects and PartyServer |

---

## Quick start

```bash
npx @cioky/vike-create my-app
cd my-app
npm run dev
```

### Scaffold options

```bash
# Default: Tailwind CSS
npx @cioky/vike-create my-app

# Panda CSS
npx @cioky/vike-create my-app --style pandacss

# Cloudflare Workers + Remult
npx @cioky/vike-create my-app --style tailwind --cloudflare --remult

# Full stack: Cloudflare + Remult + Better Auth
npx @cioky/vike-create my-app --style tailwind --cloudflare --remult --betterauth

# No CSS framework
npx @cioky/vike-create my-app --style none
```

---

## What these packages solve

Vike doesn't natively understand `.tsrx` files. Ripple's Vite plugin has a cache-miss bug with Vite's `?direct` query parameter for CSS. CSS frameworks can't resolve `@apply` inside Ripple's component-scoped `<style>` blocks.

Each integration package applies automatic, idempotent patches:

- **`.tsrx` registration** — teaches Vite to handle Ripple's template syntax
- **`?direct` CSS fix** — prevents stale cache hits on direct style imports
- **`@apply` patch** — injects a `tailwindcss` / `@layer` reference so framework utilities resolve inside `<style>`

Run `npx <package> setup` once after installing. It patches `node_modules` in-place with zero configuration.

---

## Architecture

```
packages/
├── vike/              ← SSR framework integration
│   ├── core/          — Vike hook wiring, page context, streaming
│   ├── tailwindcss/   — Tailwind plugin + setup patch
│   ├── pandacss/      — Panda plugin + .tsrx → TSX transformer
│   └── create/        — Template-based scaffold CLI
├── ripple/            ← Framework-agnostic Ripple ecosystem
│   ├── transitions/   — FLIP animations, motion presets, layout transitions
│   ├── query/         — Reactive query cache (Map + Tracked signals)
│   └── query-remult/  — Remult adapter (auto-key, LiveQuery, SSE)
└── remult/
    └── partykit/      — Durable Object realtime for Remult
```

### Plugin order (vite.config.ts)

```ts
plugins: [
  cloudflare({ viteEnvironment: { name: 'ssr' } }),  // if using CF
  vike(),
  vikeRipple(),          // @cioky/vike-core
  ripple(),
  vikeRippleTailwindcss(), // or vikeRipplePandacss()
]
```

---

## Documentation

| Resource | What's in it |
|---|---|
| [`packages/vike/core/docs/quirks.md`](./packages/vike/core/docs/quirks.md) | Every bug, fix, caveat, and workaround |
| Each package's `README.md` | Install, setup, and API docs |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Project structure and testing |
| [`AGENTS.md`](./AGENTS.md) | DOX hierarchy for AI-assisted development |

---

## Status

> **Experimental** — These packages are used in production by the maintainer but APIs may change. Everything under `@cioky/*` is fresh from the rename. If you were using the old `vike-ripple` / `vike-ripple-tailwindcss` / etc. names, migrate to the scoped versions.

### Rename migration

| Old | New |
|---|---|
| `vike-ripple` | `@cioky/vike-core` |
| `vike-ripple-tailwindcss` | `@cioky/vike-tailwindcss` |
| `vike-ripple-pandacss` | `@cioky/vike-pandacss` |
| `create-vike-ripple` | `@cioky/vike-create` |
| `ripple-transitions` | `@cioky/ripple-transitions` |
