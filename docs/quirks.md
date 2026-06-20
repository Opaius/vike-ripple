# vike-ripple Development Notes

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

**Files**: `src/integration/onRenderClient.js`, `src/integration/onRenderHtml.js`

### 4. Layout wrapping order (innermost first)

**Problem**: Layout wrapping loop `for (let i = layouts.length - 1; i >= 0; i--)` placed the page-level layout (innermost, closest to Page) at the outermost render position. Vike assembles `Layout` array as `[pageLayout, rootLayout]` (innermost first). The reverse loop creates `page(root(Page))` instead of `root(page(Page))`.

**Fix**: Use forward loop `for (let i = 0; i < layouts.length; i++)` so the tree becomes `root(page(Page))`.

**Files**: `src/integration/onRenderHtml.js`

### 5. Root cleanup prevents stale effects

**Problem**: Multiple `mount()` calls without destroying the previous root left Ripple reactive effects running, potentially modifying the DOM after re-render.

**Fix**: Store the return value of `mount()` (a cleanup function) and call it before each subsequent render.

**Files**: `src/integration/onRenderClient.js`

### 6. CSS `?direct` import patch

**Problem**: Ripple's generated virtual CSS import (e.g. `/path/to/file.tsrx?vike-ripple-css`) is not recognized by Vite's CSS pipeline, causing warnings.

**Fix**: Patch the Ripple Vite plugin transform to append `?direct` to the CSS import URL, which Vite's CSS plugin handles correctly.

**Files**: `src/integration/ripplePlugin.js`

---

## Testing Notes

- **HMR flow**: Vike sends `full-reload` (via `pluginWorkaroundVite6HmrRegression`) when SSR-only virtual modules like `@id/virtual:vike:global-entry:server` are invalidated. The browser reloads, SSR serves fresh HTML, then `onRenderClient` runs with `mount()`.

- **Vite version**: Vike bundles its own Vite (v8.0.16 shown in dev output) inside `node_modules/vike/node_modules/vite/`. The project-level `vite` dep (v6.x) is not used at runtime.

- **`vike-ripple-tailwindcss`**: Applies Tailwind v4 classes. Requires `postinstall` script `vike-ripple setup && vike-ripple-tailwindcss setup` to copy default config files.

- **Environment separation**: `ripple/internal/server` for SSR (no DOM), `ripple/internal/client` for browser (DOM). Both export `tsrx_element`, `render_component`, `template`, etc.
