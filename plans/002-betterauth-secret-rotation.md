# Plan 002: Replace deterministic BETTER_AUTH_SECRET with a per-scaffold random secret

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dd9f8a..HEAD -- packages/vike/create/src/index.js`
> If this file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `0dd9f8a`, 2026-06-26

## Why this matters

The scaffold CLI writes a hardcoded secret into every generated
`wrangler.jsonc`:

```js
// packages/vike/create/src/index.js:153-158
wrangler.vars = {
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'dev-secret-change-in-production!!',
    MAX_CONNECTIONS_PER_SHARD: '100',
    REALTIME_LIVE_QUERY_ROOM_MODE: 'global',
};
```

`BETTER_AUTH_SECRET` is the key Better Auth uses to sign session cookies and
tokens. The value `dev-secret-change-in-production!!` is identical across
every project generated with `--betterauth`. A user who deploys without
changing it has auth tokens signed by a publicly known secret — anyone can
forge sessions. The generated `.gitignore` ignores `.env` but `wrangler.jsonc`
is committed, so the secret enters version control too.

The fix: generate a cryptographically random secret per scaffold run using
Node's `crypto` builtin (zero new dependencies), and print a warning telling
the user to move it to a Wrangler secret for production.

## Current state

**The file** — `packages/vike/create/src/index.js` (234 lines, plain ESM JS):

- Line 1-5: imports from `fs`, `path`, `url`, `child_process`. No `crypto`
  import yet.
- Line 153-158: the `wrangler.vars` block with the hardcoded secret (shown
  above).
- Line 160: `writeFileSync(join(root, 'wrangler.jsonc'), JSON.stringify(wrangler, null, 2) + '\n');`
- Line 210-233: the final console output section (`console.log` for "Created",
  "Installing dependencies", setup steps, "Done!").

**Conventions**:

- Plain JavaScript, ESM (`import` syntax, `type: 'module'`).
- Uses Node builtins only (`fs`, `path`, `child_process`). Adding `crypto`
  (another Node builtin) is consistent — no new npm dependency.
- `crypto.randomBytes(32).toString('hex')` produces a 64-char hex string —
  sufficient entropy for a session-signing secret (Better Auth recommends
  32+ bytes).
- The CLI is invoked as `node packages/vike/create/src/index.js <name> [flags]`.

**The `--betterauth` flag path** (line 38, 51-57, 71, 84, 165-198):

- Requires `--remult` (line 38 guards this).
- Only generates the `wrangler.vars` with the secret when BOTH `--cloudflare`
  AND `--remult` AND `--betterauth` are set (the `wrangler` object is only
  built inside `if (cloudflare)`, line 136; `betterauth` without cloudflare
  doesn't get wrangler vars — it gets a plain server/hono.ts instead).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun run typecheck`      | exit 0, no errors   |
| Lint      | `bun run lint`           | no NEW diagnostics in index.js |
| Scaffold  | `node packages/vike/create/src/index.js <name> --style tailwind --cloudflare --remult --betterauth` | generates project; wrangler.jsonc has a random secret |

Note: the scaffold command runs `npm install` automatically (line 217). Run
it in a temp directory to avoid polluting the worktree. It needs network
access. If offline, verify by reading the generated `wrangler.jsonc` after
the writeFileSync step — but the install will fail. See STOP conditions.

## Scope

**In scope** (the only file you should modify):
- `packages/vike/create/src/index.js`

**Out of scope** (do NOT touch):
- `packages/vike/create/templates/betterauth/**` — template files are fine;
  the secret is in the dynamic wrangler.jsonc generation, not the templates.
- `packages/vike/create/templates/remult-cf/**` — same.
- Any other package.

## Git workflow

- Branch: `advisor/002-betterauth-secret`
- Commit message: `fix(create): generate random BETTER_AUTH_SECRET per scaffold instead of hardcoded value`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Import crypto and generate a random secret

At the top of `packages/vike/create/src/index.js`, add `crypto` to the
imports. The file currently imports from `node` builtins like:

```js
import { readFileSync, mkdirSync, writeFileSync, cpSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
```

Add after the existing imports:

```js
import { randomBytes } from 'crypto';
```

Then, inside the `if (remult)` block within the `if (cloudflare)` section
(around line 153), replace the hardcoded secret line. The current code:

```js
wrangler.vars = {
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'dev-secret-change-in-production!!',
    MAX_CONNECTIONS_PER_SHARD: '100',
    REALTIME_LIVE_QUERY_ROOM_MODE: 'global',
};
```

Change the `BETTER_AUTH_SECRET` line to generate a random value:

```js
wrangler.vars = {
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    MAX_CONNECTIONS_PER_SHARD: '100',
    REALTIME_LIVE_QUERY_ROOM_MODE: 'global',
};
```

**Verify**: `bun run typecheck` → exit 0 (the file is JS but the root
tsconfig references the create package; typecheck should still pass).

### Step 2: Add a console warning about the secret

After the `writeFileSync(join(root, 'wrangler.jsonc'), ...)` call (line 160)
and inside the `if (cloudflare && remult)` flow, or in the final output
section (around line 210-215), add a warning when `betterauth` is set. After
the existing `console.log('\n  \x1b[1mDone!\x1b[22m');` block, add before it:

```js
if (betterauth) {
    console.log(`\n  \x1b[33m⚠ BETTER_AUTH_SECRET was auto-generated in wrangler.jsonc.\x1b[0m`);
    console.log(`  \x1b[33m  For production, set it as a Wrangler secret:\x1b[0m`);
    console.log(`  \x1b[33m  wrangler secret put BETTER_AUTH_SECRET\x1b[0m`);
}
```

Place this in the output section (after line 214 `if (betterauth) label +=
', Better Auth';` and before the "Created" log, or after the "Done" log —
match the existing console.log style in that section).

**Verify**: Read the modified file and confirm the warning block is inside a
`if (betterauth)` guard and the `randomBytes` call is in the wrangler.vars
block.

### Step 3: Verify with a scaffold run

Run the CLI in a temp directory to confirm the generated `wrangler.jsonc`
contains a random hex secret, not the old hardcoded string:

```bash
cd /tmp && rm -rf test-secret-app && node /home/cioky/Projects/vike-ripple/packages/vike/create/src/index.js test-secret-app --style tailwind --cloudflare --remult --betterauth
```

Then check the generated file:

```bash
grep BETTER_AUTH_SECRET /tmp/test-secret-app/wrangler.jsonc
```

**Verify**:
- The grep output shows `"BETTER_AUTH_SECRET": "<64-char hex string>"` —
  NOT `"dev-secret-change-in-production!!"`.
- The console output includes the warning about `wrangler secret put
  BETTER_AUTH_SECRET`.
- `bun run typecheck` → exit 0.
- `bun run lint` → no new diagnostics in `packages/vike/create/src/index.js`.

## Test plan

No automated test framework covers the CLI generator (it produces a full
project with `npm install`). Verification is the scaffold run in step 3 —
a manual integration check. If a future plan adds CLI tests, the secret
generation should be covered (assert the generated value is 64 hex chars
and differs across two runs).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep 'dev-secret-change-in-production' packages/vike/create/src/index.js` returns no matches
- [ ] `grep 'randomBytes' packages/vike/create/src/index.js` returns a match
- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` introduces no new diagnostics in `packages/vike/create/src/index.js`
- [ ] A scaffold run (`--betterauth --cloudflare --remult`) produces a `wrangler.jsonc` with a 64-char hex `BETTER_AUTH_SECRET`, not the old string
- [ ] No files outside `packages/vike/create/src/index.js` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `wrangler.vars` block at line 153-158 doesn't exist or has a different
  shape (the CLI may have been refactored).
- `randomBytes` from `crypto` is not available in the target Node version
  (it's been in Node since v0.5.8 — only stop if the repo targets an
  exotic runtime).
- The scaffold run in step 3 fails for reasons unrelated to the secret
  change (e.g. `npm install` network failure) — in that case, verify by
  reading the source diff and the generated `wrangler.jsonc` if the write
  happened before the failure.
- The `--betterauth` flag no longer requires `--cloudflare` (if the secret
  is now written outside the `if (cloudflare)` block, the fix location
  changes — STOP and report).

## Maintenance notes

- This only fixes new scaffolds. Existing generated projects still have the
  old hardcoded secret — the user should rotate manually (`wrangler secret
  put BETTER_AUTH_SECRET`) in any deployed project.
- If `wrangler.jsonc` is later replaced with `.dev.vars` or a different
  config format, the secret generation must move with it.
- A reviewer should confirm the `randomBytes(32).toString('hex')` call is
  inside the per-scaffold execution path (not hoisted to module scope),
  so each run gets a fresh secret.
