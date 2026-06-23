# DOX — vike-ripple-tailwindcss

## Purpose

Tailwind CSS v4 integration for Ripple TS. Enables `@apply` inside Ripple `<style>` blocks by patching `@ripple-ts/vite-plugin` to prepend `@import "tailwindcss" layer(reference)` to extracted CSS.

## Ownership

- `src/index.js` — Vite plugin (marker with `enforce: 'pre'`)
- `src/setup.js` — CLI setup that applies the tailwind @import patch

## Local Contracts

- Run `vike-ripple setup` BEFORE this package's setup
- The patch checks for `TW_PATCH_APPLY` for idempotency
- Re-running setup detects existing patch and skips

## Verification

- Create a project with `--style tailwind`, verify `@apply` in `<style>` blocks produces styled output
- `vike-ripple-pandacss setup` must be able to replace this package's patch
