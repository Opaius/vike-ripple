# DOX — @cioky/vike-create

## Purpose

Project scaffold generator. Creates a new Vike + Ripple TS project from a single CLI command. Supports flags for CSS framework, Cloudflare Workers, and Remult.

## Ownership

- `src/index.js` — single-file generator (all template logic)
- `package.json` — version bumps only; `files: ["src"]`

## Local Contracts

- Always use `vike()` before `vikeRipple()` in generated vite configs
- Plugin order: `cloudflare()` → `vike()` → `vikeRipple()` → `ripple()` → style plugin
- Setup scripts run in order: `@cioky/vike-core setup` → style plugin setup → `wrangler types`
- Don't pre-generate `worker-configuration.d.ts` — let `wrangler types` create it
- `remult-partykit` imports must match the npm package API exactly:
  - `remult/remult-hono` (not `remult/hono`)
  - `remult/remult-d1` (not `remult/d1`)
  - `resolveRoomIdFromChannel` from `remult-partykit/durable-object`
  - `@vikejs/hono`: use `vike(app, [])` not `createMiddleware({})`

## Flags

| Flag | Effect |
|------|--------|
| `--style tailwind` | Tailwind CSS v4 (default) |
| `--style pandacss` | Panda CSS |
| `--style none` | No CSS framework |
| `--cloudflare` | Cloudflare Workers config |
| `--remult` | Remult ORM (SSE without CF, DO-based with CF) |

## Verification

- Cold-test every change: create project with `node src/index.js test-app --style X`, SSR-check, build-check
- All 5 flag combinations must pass: tailwind, pandacss, cloudflare, remult, remult+cloudflare
