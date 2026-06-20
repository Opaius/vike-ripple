#!/usr/bin/env node
import { createRequire } from 'module'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const projectRoot = process.cwd()
let exitCode = 0

function log(m)  { console.log('[vike-ripple]', m) }
function warn(m) { console.warn('[vike-ripple]', m) }

function patchVikeExtensions() {
  const target = resolveVike('dist/utils/isScriptFile.js')
  if (!target) { warn('vike not found'); return }
  let src = readFileSync(target, 'utf-8')
  if (src.includes("'tsrx'")) { log('.tsrx already registered'); return }
  const patched = src.replace(
    'const scriptFileExtensionList = [...extJsOrTs, ...extJsxOrTsx, ...extTemplates];',
    "const scriptFileExtensionList = [...extJsOrTs, ...extJsxOrTsx, ...extTemplates, 'tsrx'];",
  )
  if (patched === src) { warn('Could not patch Vike'); exitCode = 1; return }
  writeFileSync(target, patched, 'utf-8')
  log('Registered .tsrx extension')
}

function patchRippleDirect() {
  const target = resolveRipple('src/index.js')
  if (!target) { warn('@ripple-ts/vite-plugin not found'); return }
  let src = readFileSync(target, 'utf-8')
  if (src.includes('Handle ?direct query param')) { log('?direct fix already applied'); return }
  const patched = src.replace(
    'if (cssCache.has(id)) {\n\t\t\t\t\treturn cssCache.get(id);\n\t\t\t\t}',
    `if (cssCache.has(id)) {
\t\t\t\t\treturn cssCache.get(id);
\t\t\t\t}
\t\t\t\tif (id.includes('?direct')) {
\t\t\t\t\tconst baseId = id.replace('?direct', '');
\t\t\t\t\tif (cssCache.has(baseId)) {
\t\t\t\t\t\treturn cssCache.get(baseId);
\t\t\t\t\t}
\t\t\t\t}`,
  )
  if (patched === src) { warn('Could not patch Ripple plugin'); exitCode = 1; return }
  writeFileSync(target, patched, 'utf-8')
  log('Patched Ripple plugin for ?direct CSS loading')
}

function patchRippleApply() {
  const target = resolveRipple('src/index.js')
  if (!target) return
  let src = readFileSync(target, 'utf-8')
  if (src.includes('TW_PATCH_APPLY')) { log('@apply patch already applied'); return }
  if (src.includes('TW_PATCH:')) {
    src = src.replace('// TW_PATCH: prepend tailwindcss','// TW_PATCH_APPLY: apply')
    src = src.replace("css = '@import \"tailwindcss\";\\n' + css;","css = '@import \"tailwindcss\" layer(reference);\\n' + css;")
    writeFileSync(target, src, 'utf-8')
    log('Upgraded @apply patch');
    return
  }
  const orig = '\t\t\t\t\tif (css) {\n\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, \'style\');\n\t\t\t\t\t\tcssCache.set(cssId, css);'
  const rep = '\t\t\t\t\tif (css) {\n\t\t\t\t\t\t// TW_PATCH_APPLY: @apply support\n\t\t\t\t\t\tcss = \'@import "tailwindcss" layer(reference);\\n\' + css;\n\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, \'style\');\n\t\t\t\t\t\tcssCache.set(cssId, css);'
  const result = src.replace(orig, rep)
  if (result === src) { warn('Could not patch @apply'); return }
  writeFileSync(target, result, 'utf-8')
  log('Patched Ripple plugin for @apply')
}

function resolveVike(rel) {
  const p = join(projectRoot, 'node_modules', 'vike', rel)
  if (existsSync(p)) return p
  try { return createRequire(join(projectRoot, 'package.json')).resolve('vike/' + rel) } catch { return null }
}

function resolveRipple(rel) {
  const p = join(projectRoot, 'node_modules', '@ripple-ts', 'vite-plugin', rel)
  if (existsSync(p)) return p
  try { return createRequire(join(projectRoot, 'package.json')).resolve('@ripple-ts/vite-plugin/' + rel) } catch { return null }
}

log('Applying patches...')
patchVikeExtensions()
patchRippleDirect()
patchRippleApply()
log('Done')
process.exit(exitCode)
