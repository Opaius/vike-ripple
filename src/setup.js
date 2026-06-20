#!/usr/bin/env node
/**
 * vike-ripple setup — patches Vike and Ripple for .tsrx support.
 *
 * Run once:  npx vike-ripple setup
 * Or add to project's package.json:  "postinstall": "vike-ripple setup"
 */
import { createRequire } from 'module'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = process.cwd()
let exitCode = 0

function log(msg)  { console.log('[vike-ripple]', msg) }
function warn(msg) { console.warn('[vike-ripple]', msg) }

// ── Patch 1: Register .tsrx with Vike ─────────────────────────
function patchVikeExtensions() {
  const target = resolveVike('dist/utils/isScriptFile.js')
  if (!target) { warn('vike not found — skipping'); return }

  let src = readFileSync(target, 'utf-8')
  if (src.includes("'tsrx'")) { log('.tsrx already registered with Vike'); return }

  const patched = src.replace(
    'const scriptFileExtensionList = [...extJsOrTs, ...extJsxOrTsx, ...extTemplates];',
    "const scriptFileExtensionList = [...extJsOrTs, ...extJsxOrTsx, ...extTemplates, 'tsrx'];",
  )
  if (patched === src) { warn('Could not patch Vike isScriptFile.js'); exitCode = 1; return }
  writeFileSync(target, patched, 'utf-8')
  log('Registered .tsrx extension with Vike')
}

// ── Patch 2: Fix ?direct in Ripple's load hook ────────────────
function patchRippleDirect() {
  const target = resolveRipple('src/index.js')
  if (!target) { warn('@ripple-ts/vite-plugin not found — skipping'); return }

  let src = readFileSync(target, 'utf-8')
  if (src.includes('Handle ?direct query param')) { log('?direct fix already applied'); return }

  const patched = src.replace(
    'if (cssCache.has(id)) {\n\t\t\t\t\treturn cssCache.get(id);\n\t\t\t\t}',
    `if (cssCache.has(id)) {
					return cssCache.get(id);
				}

				// Handle ?direct query param added by Vite's SSR module loading
				if (id.includes('?direct')) {
					const baseId = id.replace('?direct', '');
					if (cssCache.has(baseId)) {
						return cssCache.get(baseId);
					}
				}`,
  )
  if (patched === src) { warn('Could not patch Ripple plugin load hook'); exitCode = 1; return }
  writeFileSync(target, patched, 'utf-8')
  log('Patched Ripple plugin for ?direct CSS module loading')
}

// ── Patch 3: @apply support ───────────────────────────────────
function patchRippleApply() {
  const target = resolveRipple('src/index.js')
  if (!target) return

  let src = readFileSync(target, 'utf-8')

  if (src.includes('TW_PATCH_APPLY')) { log('@apply patch already applied'); return }

  // Upgrade from old TW_PATCH format
  if (src.includes('TW_PATCH:')) {
    src = src.replace(
      '// TW_PATCH: prepend tailwindcss so @apply works',
      '// TW_PATCH_APPLY: bring tailwindcss into scope for @apply',
    )
    src = src.replace(
      "css = '@import \"tailwindcss\";\\n' + css;",
      "css = '@import \"tailwindcss\" layer(reference);\\n' + css;",
    )
    writeFileSync(target, src, 'utf-8')
    log('Upgraded @apply patch to layer(reference) (HMR-safe)')
    return
  }

  // Fresh install — prepend @import with reference layer
  const orig = (
    '\t\t\t\t\tif (css) {\n' +
    '\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, \'style\');\n' +
    '\t\t\t\t\t\tcssCache.set(cssId, css);'
  )
  const patched = (
    '\t\t\t\t\tif (css) {\n' +
    '\t\t\t\t\t\t// TW_PATCH_APPLY: bring tailwindcss into scope for @apply\n' +
    "\t\t\t\t\t\tcss = '@import \"tailwindcss\" layer(reference);\\n' + css;\n" +
    '\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, \'style\');\n' +
    '\t\t\t\t\t\tcssCache.set(cssId, css);'
  )

  const result = src.replace(orig, patched)
  if (result === src) { warn('Could not patch Ripple plugin for @apply'); return }
  writeFileSync(target, result, 'utf-8')
  log('Patched Ripple plugin for @apply support in <style> blocks')
}

// ── Resolve helpers ────────────────────────────────────────────
function resolveVike(rel) {
  const p = join(projectRoot, 'node_modules', 'vike', rel)
  if (existsSync(p)) return p
  try { const r = createRequire(join(projectRoot, 'package.json')); return r.resolve('vike/' + rel) } catch { return null }
}

function resolveRipple(rel) {
  const p = join(projectRoot, 'node_modules', '@ripple-ts', 'vite-plugin', rel)
  if (existsSync(p)) return p
  try { const r = createRequire(join(projectRoot, 'package.json')); return r.resolve('@ripple-ts/vite-plugin/' + rel) } catch { return null }
}

// ── Main ──────────────────────────────────────────────────────
log('Applying patches...')
patchVikeExtensions()
patchRippleDirect()
patchRippleApply()
log('Done')
process.exit(exitCode)
