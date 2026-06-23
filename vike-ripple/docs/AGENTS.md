# DOX — docs

## Purpose

Central documentation for all known bugs, fixes, caveats, and architectural decisions across the monorepo.

## Ownership

- `docs/quirks.md` — the single source of truth for every issue discovered during development

## Local Contracts

- Every new bug or fix MUST be documented in `quirks.md` before the task is done
- Keep descriptions concise: Problem, Root cause, Fix, Files affected
- When removing a package from the repo (like `ripple-partykit`), update the comparison table or remove it
- Stale entries get deleted, not annotated as "deprecated"

## Verification

- After any fix, check if `quirks.md` needs updating
- After removing a package, remove all references to it from `quirks.md`
