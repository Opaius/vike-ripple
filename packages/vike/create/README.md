# @cioky/vike-create

Scaffold a [Vike](https://vike.dev) + [Ripple TS](https://ripple-ts.com) project.

Part of the [vike-ripple monorepo](https://github.com/Opaius/vike-ripple).

## Usage

```bash
# With Tailwind CSS (default)
npx @cioky/vike-create my-app

# With Panda CSS
npx @cioky/vike-create my-app --style pandacss

# Without a CSS framework
npx @cioky/vike-create my-app --style none

# With Cloudflare Workers support
npx @cioky/vike-create my-app --style tailwind --cloudflare

# With Remult (SSE live query everywhere)
npx @cioky/vike-create my-app --style tailwind --remult

# With Remult + Cloudflare (DO-based realtime)
npx @cioky/vike-create my-app --style tailwind --remult --cloudflare
```

## Flags

| Flag | Description |
|------|-------------|
| `--style tailwind` | Tailwind CSS v4 (default) |
| `--style pandacss` | Panda CSS |
| `--style none` | No CSS framework |
| `--cloudflare` | Cloudflare Workers setup (wrangler, D1, DO config) |
| `--remult` | Remult ORM with realtime subscriptions |
| `--remult --cloudflare` | Remult with Durable Object-based realtime via `remult-partykit` |

## What's included

The scaffold creates:

- Vike pages (`pages/index`, `pages/about`) with SSR
- Ripple TS `.tsrx` file support
- `@cioky/vike-core` config (Layout, Head, hooks)
- CSS framework config (tailwind.css or panda.config.ts)
- Cloudflare Workers config when `--cloudflare` is set
- Remult + realtime subscription setup when `--remult` is set

## Generated Packages

| Package | Installed when |
|---------|---------------|
| `@cioky/vike-core` | Always |
| `@cioky/vike-tailwindcss` | `--style tailwind` |
| `@cioky/vike-pandacss` | `--style pandacss` |
| `remult-partykit` | `--remult --cloudflare` |

See the [main repo](https://github.com/Opaius/vike-ripple) for per-package documentation.
