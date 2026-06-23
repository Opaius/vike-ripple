# DOX — vike-ripple (core)

## Purpose

Core Vike + Ripple TS integration. Provides SSR rendering, client hydration, streaming, `<head>` management, `.tsrx` page file support, and the CLI setup script that patches Vike and Ripple.

## Ownership

- `src/integration/onRenderClient.js` — client-side mount + routing
- `src/integration/onRenderHtml.js` — SSR rendering
- `src/hooks/` — usePageContext, useHydrated, useData, useConfig
- `src/setup.js` — CLI patches for .tsrx, ?direct, server isolation, client routing guard
- `src/config.js` — Vike config extension
- `docs/quirks.md` — all bugs, fixes, and caveats

## Local Contracts

- `usePageContext`/`useHydrated` use single `track()` at module init — never `track()` inside the hook function
- `onRenderClient` builds component tree outside `mount()`, passes wrapped component directly — no `App()` wrapper
- `patchRippleDirect` guards on `id.includes('?direct')` — not a phantom comment string
- Plugin order: `vike()` before `vikeRipple()` in all vite configs

## Work Guidance

- When fixing a routing issue: check `usePageContext.js` first (per-call track vs single-signal)
- When updating setup patches: ensure they're idempotent (guard string must match actual code)
- Document every new bug/fix in `docs/quirks.md`

## Verification

- SSR: `curl -s http://localhost:3000/ | grep -o 'Hello'`
- Click routing: puppeteer-core, click `a[href="/about"]`, verify title changes
- Build: `vite build` exits 0

## Child DOX Index

| Path | Scope |
|------|-------|
| [`docs/AGENTS.md`](./docs/AGENTS.md) | Documentation quirks & guides |
