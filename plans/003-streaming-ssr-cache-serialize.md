# Plan 003: Serialize query cache and flush pending in the streaming SSR path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dd9f8a..HEAD -- packages/vike/core/src/integration/onRenderHtml.js`
> If this file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0dd9f8a`, 2026-06-26

## Why this matters

`onRenderHtml.js` has two render paths: a streaming path (when
`config.stream` is set) and a non-streaming path. Only the **non-streaming**
path calls `flushPending()` and `serializeCache()` — the streaming path
returns the HTML early without either. This means: when streaming is enabled,
the `@cioky/ripple-query` cache populated during SSR never gets serialized
into the HTML, and `onRenderClient.js`'s `hydrateCache()` call finds no
`<script id="__rq_cache">` tag. The client re-fetches every query on
hydration — the double-fetch that the DESIGN doc (`DESIGN-ripple-query.md`
SSR section, line 70-77) explicitly says should be prevented.

Additionally, `flushPending()` (see plan 004's companion issue) must be
called in both paths so the cache entries have `status: 'success'` before
serialization.

## Current state

**The file** — `packages/vike/core/src/integration/onRenderHtml.js` (195
lines, plain ESM JS):

The streaming branch (lines 62-83):

```js
if (enableStream) {
    const rippleStream = create_ssr_stream();
    render(wrappedPage, { stream: rippleStream.sink }).catch(
        (e) => {
            console.error('[ripple] render err:', e?.message);
        }
    );
    return escapeInject`<!DOCTYPE html>
        <html${dangerouslySkipEscape(htmlAttributesString)}>
          <head>
            <meta charset="UTF-8" />
            ${dangerouslySkipEscape(headHtmlBegin)}
            ${dangerouslySkipEscape(headHtml)}
            ${dangerouslySkipEscape(headHtmlEnd)}
          </head>
          <body${dangerouslySkipEscape(bodyAttributesString)}>
            ${dangerouslySkipEscape(bodyHtmlBegin)}
            <div id="root">${rippleStream.stream}</div>
            ${dangerouslySkipEscape(bodyHtmlEnd)}
          </body>
        </html>`;
}
```

The non-streaming branch (lines 85-120) does the cache work correctly:

```js
// ... render, get body ...

// Serialize query cache from the per-request ALS store
let cacheTag = '';
try {
    const mod = await import('@cioky/ripple-query');
    if (typeof mod.flushPending === 'function')
        await mod.flushPending();
    if (typeof mod.serializeCache === 'function') {
        cacheTag = mod.serializeCache();
    }
} catch {}
pageContext.pageHtmlString = body;
// ... return HTML with cacheTag in <head> ...
```

The streaming branch returns before reaching this cache block.

**The challenge**: the streaming path calls `render()` without `await` — the
render streams asynchronously into `rippleStream.sink`. The cache isn't
populated until the render completes. So `flushPending()` + `serializeCache()`
must run **after the stream finishes**, not at the start.

In streaming SSR, the `<head>` is flushed immediately and the body streams
asynchronously. The cache data only exists after all components have rendered
and their data fetches have resolved. Therefore:

1. **The cache `<script>` tag must go at the stream TAIL** — after the
   streamed body content, before `</body>`. It cannot go in `<head>` because
   the cache doesn't exist when the head is flushed.
2. **`flushPending()` must complete BEFORE `serializeCache()`** — the flush
   awaits all in-flight fetch promises so their results land in the cache as
   `status: 'success'`. Only then does `serializeCache()` emit entries with
   data. If you serialize before flushing, you get an empty or partial cache
   tag → hydration double-fetch is not prevented.
3. **The tag is written to the stream sink** — `rippleStream.sink` is the
   writable side of the stream. After `render()` resolves, write the cache
   tag string to the sink so it appears after the body content in the HTML.
   `hydrateCache()` on the client reads by `document.getElementById('__rq_cache')`
   — it searches the whole document, so placement at the tail works.

The `escapeInject` template is evaluated immediately at `return` time, so a
`cacheTag` variable assigned in a `.then()` callback would be empty — the tag
**must** be written to the stream sink directly, not interpolated into the
template.

**Conventions**:

- The file uses `escapeInject` and `dangerouslySkipEscape` from `vike/server`
  for HTML construction. The cache tag is an HTML string that should be
  `dangerouslySkipEscape`d.
- The `try/catch {}` around the query-cache import is intentional — the
  integration works without `@cioky/ripple-query` installed (it's optional).
  Match this pattern.
- The file uses `globalThis.__rq_cache_storage` (ALS) set up at module scope
  (line 22-23). The streaming render runs inside `als.run(new Map(), ...)`
  (the outer `return globalThis.__rq_cache_storage.run(new Map(), async () => {`
  at line 56). So the cache IS per-request — it just doesn't get serialized
  in the streaming path.

**Client-side hydration** — `packages/vike/core/src/integration/onRenderClient.js`
lines 66-70:

```js
try {
    const { hydrateCache } = await import('@cioky/ripple-query');
    if (typeof hydrateCache === 'function') hydrateCache();
} catch {}
```

`hydrateCache()` reads `document.getElementById('__rq_cache')` — it searches
the whole document, so the script tag can be anywhere in the HTML.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun run typecheck`      | exit 0, no errors   |
| Tests     | `bun run test`           | all pass            |
| Lint      | `bun run lint`           | no new diagnostics  |

## Scope

**In scope** (the only file you should modify):
- `packages/vike/core/src/integration/onRenderHtml.js`

**Out of scope** (do NOT touch):
- `packages/vike/core/src/integration/onRenderClient.js` — the client
  `hydrateCache()` call is correct; it works regardless of where the script
  tag is in the DOM.
- `packages/ripple/query/src/index.ts` — the `serializeCache()`/`flushPending()`
  functions themselves are not changed here (plan 004 touches the core query
  module).
- Any streaming infrastructure in the `ripple` package.

## Git workflow

- Branch: `advisor/003-streaming-cache-serialize`
- Commit message: `fix(core): serialize query cache in streaming SSR path to prevent hydration double-fetch`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Write the cache tag to the stream sink after render completes

The current streaming path fires `render()` without awaiting and returns the
HTML immediately. The cache is populated asynchronously during the stream.
The fix: after `render()` resolves, **flush pending fetches, then serialize
the cache, then write the tag to the stream sink** — so it appears at the
tail of the streamed body, before `</body>`.

**Ordering is critical**: `flushPending()` → `serializeCache()` → `sink.write(tag)`.
If you serialize before flushing, in-flight fetches haven't landed in the
cache yet, and the tag will be empty or partial.

The current code (lines 62-83):

```js
if (enableStream) {
    const rippleStream = create_ssr_stream();
    render(wrappedPage, { stream: rippleStream.sink }).catch(
        (e) => {
            console.error('[ripple] render err:', e?.message);
        }
    );
    return escapeInject`<!DOCTYPE html>
        <html...>
          ...
            <div id="root">${rippleStream.stream}</div>
          ...
        </html>`;
}
```

Change to — write the cache tag to the sink after render + flush:

```js
if (enableStream) {
    const rippleStream = create_ssr_stream();
    render(wrappedPage, { stream: rippleStream.sink })
        .then(async () => {
            // 1. Flush all pending fetch promises so their data lands in cache
            // 2. Serialize cache → <script id="__rq_cache"> tag
            // 3. Write the tag to the stream sink → appears at body tail
            try {
                const mod = await import('@cioky/ripple-query');
                if (typeof mod.flushPending === 'function')
                    await mod.flushPending();
                if (typeof mod.serializeCache === 'function') {
                    const tag = mod.serializeCache();
                    if (tag && rippleStream.sink) {
                        // Write the cache tag to the stream after the body.
                        // hydrateCache() on the client finds it by element ID
                        // from anywhere in the document.
                        if (typeof rippleStream.sink.write === 'function') {
                            rippleStream.sink.write(tag);
                        } else if (typeof rippleStream.sink.append === 'function') {
                            rippleStream.sink.append(tag);
                        }
                    }
                }
            } catch {}
        })
        .catch((e) => {
            console.error('[ripple] render err:', e?.message);
        });

    return escapeInject`<!DOCTYPE html>
        <html${dangerouslySkipEscape(htmlAttributesString)}>
          <head>
            <meta charset="UTF-8" />
            ${dangerouslySkipEscape(headHtmlBegin)}
            ${dangerouslySkipEscape(headHtml)}
            ${dangerouslySkipEscape(headHtmlEnd)}
          </head>
          <body${dangerouslySkipEscape(bodyAttributesString)}>
            ${dangerouslySkipEscape(bodyHtmlBegin)}
            <div id="root">${rippleStream.stream}</div>
            ${dangerouslySkipEscape(bodyHtmlEnd)}
          </body>
        </html>`;
}
```

**Do NOT** try to interpolate a `cacheTag` variable into the `escapeInject`
template — the template is evaluated at `return` time (immediately), before
the `.then()` callback runs. The tag must be written to the stream sink
directly. The `escapeInject` template stays unchanged from the original
(except removing the now-unneeded cacheTag interpolation if one was added).

**Before writing the code**, inspect what `create_ssr_stream()` returns to
confirm the sink has a writable method. Read the ripple server export:

```bash
grep -r 'create_ssr_stream\|createSsrStream' node_modules/ripple/dist/ 2>/dev/null | head -10
```

Or check the type:

```bash
grep -A5 'create_ssr_stream' node_modules/ripple/dist/server.d.ts 2>/dev/null
```

The sink may have `.write()`, `.append()`, `.push()`, or be a Writable stream.
Use whichever method exists. If the sink is sealed after the stream ends
(i.e. writes after render resolves are silently dropped), **STOP and report**
— see STOP conditions.

**Verify**: `bun run typecheck` → exit 0. Read the modified file and confirm:
1. The `.then()` callback calls `flushPending()` with `await` BEFORE
   `serializeCache()`.
2. The serialized tag is written to `rippleStream.sink`, not interpolated
   into `escapeInject`.
3. The `escapeInject` template does NOT contain a `cacheTag` variable.

### Step 2: Verify the non-streaming path is unchanged

Read the non-streaming branch (the `let renderFn = ...` section) and confirm
it still has the `flushPending()` + `serializeCache()` block. The fix only
adds cache serialization to the streaming path — the non-streaming path
already works.

**Verify**: Read the file, confirm the non-streaming path's cache block is
intact (lines ~105-114 in the original).

### Step 3: Full verification

**Verify**:
- `bun run typecheck` → exit 0
- `bun run test` → all pass (no test directly covers this, but ensure no
  regressions)
- `bun run lint` → no new diagnostics in `onRenderHtml.js`

## Test plan

There is no automated integration test for streaming SSR (plan 001 covers
unit tests for query-remult; this is an integration-level fix in the SSR
renderer). Verification is:
1. Typecheck passes.
2. Manual SSR check: scaffold a project with `--cloudflare`, enable
   `stream: true` in config, run `vike dev`, `curl -s http://localhost:3000/
   | grep '__rq_cache'` — should find the script tag. (This is manual; if
   you can't run a dev server, verify by code read.)
3. Existing tests pass (no regression).

If a future plan adds SSR integration tests (finding #18), the streaming +
cache serialization path should be covered.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0 (no regressions)
- [ ] `bun run lint` introduces no new diagnostics in `onRenderHtml.js`
- [ ] The streaming branch in `onRenderHtml.js` calls `flushPending()` and
  `serializeCache()` (or writes the cache tag to the stream)
- [ ] The non-streaming branch is unchanged
- [ ] No files outside `packages/vike/core/src/integration/onRenderHtml.js` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `create_ssr_stream()` API doesn't support writing to the sink after
  render completes (no `.write()` method, or the stream is sealed). Report
  what the stream object's interface looks like.
- `rippleStream.stream` is not a plain string or injectable value — if it's
  a special Vike/ripple streaming primitive that can't have content appended
  after it.
- The `enableStream` branch at line 62 doesn't exist or has been
  significantly refactored.
- The `flushPending` / `serializeCache` functions from `@cioky/ripple-query`
  don't exist or have different signatures.

## Maintenance notes

- This fix couples the streaming SSR path to `@cioky/ripple-query` being
  installed. The `try/catch {}` guards this — if the package isn't installed,
  streaming still works, just without cache serialization (same as before
  this fix).
- If Ripple's `create_ssr_stream()` API changes (e.g. the sink interface),
  the cache-tag injection mechanism may need updating.
- A reviewer should verify that the cache tag actually appears in the
  rendered HTML by running a dev server with streaming enabled. The code-
  level fix is necessary but not sufficient proof — the streaming timing
  must work in practice.
- Plan 004 changes `flushPending`/`serializeCache` behavior in the core
  query package — if 004 lands first, the `pending` array fix there makes
  this plan's `flushPending()` call safe across concurrent requests.
