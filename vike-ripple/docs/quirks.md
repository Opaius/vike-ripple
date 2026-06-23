# vike-ripple — Quirks, Fixes & Caveats

## Architecture Quirks & Fixes

### 1. Client-side child component wrapping

**Problem**: `append` crash — `Cannot read properties of null (reading 'before')` at `template.js:194:9` inside the rendered Layout component when calling `{props.children}`.

**Root cause**: `tsrx_element(prev)` where `prev` is a component function. Ripple's `render_tsrx_element` calls `value.render(anchor, block)`. For `tsrx_element(prev)`, this calls `prev(anchor, block)` — treating the first arg (`anchor`, a DOM comment node) as `props`. The component captures this node as `props`, and internal block tracking breaks because the render function signature mismatches.

**Fix**: Use `tsrx_element(() => prev({}))` instead. This wraps the component call in a proper render function that ignores `(anchor, block)` and invokes `prev` with a real props object.

**Files**: `src/integration/onRenderClient.js`, `src/integration/onRenderHtml.js`

### 2. Hydration failure — `hydrate_node` null

**Problem**: `hydrate()` crashes with `Cannot read properties of null (reading 'before')` at `hmr.js:78-79` where `target = hydrate_node` is null.

**Root cause**: Ripple's HMR wrapper (`hmr()`) overrides the render target with `hydrate_node` during hydration (`if (hydrating)`). This event occurs as a microtask (`flush_microtasks`) which can't be caught with try/catch.

**Fix**: Never call `hydrate()`. Always use `mount()` which doesn't enter hydration mode and properly clears the container.

**Files**: `src/integration/onRenderClient.js`

### 3. Layout wrapping must exist in both SSR and client

**Problem**: `onRenderClient.js` originally mounted just `Page` directly without Layout wrapping. SSR had `Layout → Page`, client had just `Page`. During HMR (full-reload → hydration), the SSR HTML (with Layout) was rendered without the Layout's client component.

**Fix**: Apply the exact same Layout/Wrapper wrapping logic in both `onRenderHtml.js` and `onRenderClient.js`. Both iterate config.Layout (innermost→outermost) and config.Wrapper.

### 4. Layout wrapping order (innermost first)

**Problem**: Layout wrapping loop `for (let i = layouts.length - 1; i >= 0; i--)` placed the page-level layout (innermost, closest to Page) at the outermost render position. Vike assembles `Layout` array as `[pageLayout, rootLayout]` (innermost first). The reverse loop creates `page(root(Page))` instead of `root(page(Page))`.

**Fix**: Use forward loop `for (let i = 0; i < layouts.length; i++)` so the tree becomes `root(page(Page))`.

### 5. Root cleanup prevents stale effects

**Problem**: Multiple `mount()` calls without destroying the previous root left Ripple reactive effects running, potentially modifying the DOM after re-render.

**Fix**: Store the return value of `mount()` (a cleanup function) and call it before each subsequent render.

### 6. CSS `?direct` import patch

**Problem**: Ripple's generated virtual CSS import (e.g. `/path/to/file.tsrx?ripple&type=style&lang.css`) is not recognized by Vite's CSS pipeline directly from the `load` hook.

**Fix**: Patch the Ripple Vite plugin's `resolveId`/`load` to intercept `?direct` query parameter and serve from cache.

### 7. `onRenderClient` `App()` pattern broke routing (v0.5.3→v0.5.4 regression)

**Problem**: Clicking links triggers `get_first_child is undefined` crash in Ripple's `template.js:126`. Routing appears broken despite SSR working.

**Root cause**: onRenderClient was refactored to use an `App()` component that reads `usePageContext()` from inside a regular function (not a `@{}` component body). Ripple's `track()`/`effect()` APIs don't work correctly when called from a plain function — signals created per-call inside `usePageContext()` don't register properly.

**Fix**: Revert to building the component tree outside `mount()` and passing the wrapped component directly. The `App()` wrapper was unnecessary since `pageContext` is available from the outer `onRenderClient` parameter.

**Files**: `src/integration/onRenderClient.js`

### 8. `usePageContext.js`/`useHydrated.js` per-call signal leak (v0.5.4)

**Problem**: Each call to `usePageContext()` creates a new `track()` signal and registers an `effect()`. Over multiple renders, the `_listeners` set grows unboundedly. More critically, `track()` called outside a proper Ripple tracking context returns signals with `null` block, which crashes on `set value` (`Cannot read properties of null (reading 'f')` at `runtime.js:1342`).

**Fix**: Create a single `track(null)` at module init time. `usePageContext()` returns `_clientPageContext.value` directly. `setPageContext()` sets the value on the single shared signal. Same pattern for `useHydrated`.

**Files**: `src/hooks/usePageContext.js`, `src/hooks/useHydrated.js`

### 9. `patchRippleDirect` idempotency (duplicate ?direct handlers)

**Problem**: Running `vike-ripple setup` multiple times appends a new `?direct` CSS handler each time. The guard string `'Handle ?direct query param'` was never actually written into the patched code, so it never matched.

**Fix**: Guard on the actual code pattern `if (id.includes('?direct'))` instead of a phantom comment. Added a comment marker in the patched code for future-proofing.

**Files**: `src/setup.js`

### 10. Pandacss setup can't override tailwind patch

**Problem**: `vike-ripple setup` patches `@ripple-ts/vite-plugin` with `@import "tailwindcss"`. `vike-ripple-pandacss setup` tried to replace the *original* pattern — but it was already replaced by the tailwind patch. The script reported "Could not find target in Ripple plugin".

**Fix**: Detect existing `TW_PATCH_APPLY` marker and replace the entire tailwind block with the Panda CSS `@layer` block.

**Files**: `vike-ripple-pandacss/src/setup.js`

### 11. Plugin ordering in vite config

**Problem**: `plugins: [vikeRipple(), vike(), ...]` — putting `vikeRipple()` before `vike()` caused Vike to not properly process some page-level hooks.

**Fix**: Always use `plugins: [vike(), vikeRipple(), ...]`. The core Vike plugin must come first.

**Files**: `vite.config.ts` in generated projects

## Known Issues / Caveats

### Tailwind `@import` + `@tailwindcss/vite` CSS pipeline hang

**Symptoms**: Dev server starts, Vike serves HTML, but the browser hangs on loading the page. Curl to the dev server may also hang. CPU usage spikes.

**Root cause**: The Ripple plugin injects `@import "tailwindcss" layer(reference);` before CSS in `<style>` blocks. Combined with `@tailwindcss/vite` which also processes `@import "tailwindcss"`, a circular dependency or infinite processing loop can occur with certain `tailwindcss`/`@tailwindcss/vite` versions.

**Status**: Not fully fixed. Affects some version combinations. Use `wrangler dev` instead of `vike dev` if using Cloudflare Workers. For pure Vike+Tailwind, try pinning `@tailwindcss/vite` to the same major version.

### `@vikejs/hono` API

`@vikejs/hono` exports `vike` as a function: `vike(app, [middlewares])`. `createMiddleware` is exposed via `@universal-middleware/core` but the `vike(app, [])` pattern is simpler and works correctly in the Cloudflare Workers context.

### `remult-partykit` vs `ripple-partykit`

Two different npm packages with overlapping APIs:

| Export | `remult-partykit` | `ripple-partykit` |
|---|---|---|
| `RemultPartyRoom` | ✅ `./durable-object` | ✅ `./durable-object` |
| `RemultLiveQueryStorageRoom` | ✅ `./durable-object` | ✅ `./durable-object` |
| `RemultPartySubscriptionClient` | ✅ `.` (index) | ✅ `.` (index) |
| `RemultPartySubscriptionServer` | ✅ `./server` | ✅ `./server` |
| `resolveRoomIdFromChannel` | ❌ | ✅ `./durable-object` |
| `SmartD1Client` | ❌ | ✅ `.` (index) |

The scaffold generates code importing from `remult-partykit` (the npm-published package). Do not use imports from `ripple-partykit` in scaffold templates.

### Remult subpath exports in workerd

When running under Cloudflare Workers (`workerd` runtime), `remult` subpath exports are restricted. Use:
- `remult/remult-hono` (not `remult/hono`)
- `remult/remult-d1` (not `remult/d1`)
- `remult` (main export, always works)

## Testing Notes

- **HMR flow**: Vike sends `full-reload` (via `pluginWorkaroundVite6HmrRegression`) when SSR-only virtual modules like `@id/virtual:vike:global-entry:server` are invalidated.
- **Click routing test**: Use puppeteer-core (`NODE_PATH` trick) to test client-side routing. `page.click('a[href="/about"]')` + `waitForNavigation()` verifies real link navigation.
- **Wrangler dev**: When `vike dev` fails with `Missing field moduleType` in the Cloudflare runner-worker, use `wrangler dev` instead — it reads build output directly.
