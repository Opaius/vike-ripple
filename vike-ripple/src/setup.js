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
  // ponytail: use the actual code pattern as the idempotency guard,
  // since no comment marker was ever written into the patched file.
  if (src.includes("id.includes('?direct')")) { log('?direct fix already applied'); return }
  const patched = src.replace(
    'if (cssCache.has(id)) {\n\t\t\t\t\treturn cssCache.get(id);\n\t\t\t\t}',
    `if (cssCache.has(id)) {
\t\t\t\t\treturn cssCache.get(id);
\t\t\t\t}
\t\t\t\t// vike-ripple: resolve ?direct CSS imports from the cache
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

function resolveRipplePackage(rel) {
  const p = join(projectRoot, 'node_modules', 'ripple', rel)
  if (existsSync(p)) return p
  try { return createRequire(join(projectRoot, 'package.json')).resolve('ripple/' + rel) } catch { return null }
}

function patchRippleServer() {
  const serverIndexFile = resolveRipplePackage('src/runtime/internal/server/index.js')
  const serverBlocksFile = resolveRipplePackage('src/runtime/internal/server/blocks.js')
  if (!serverIndexFile || !serverBlocksFile) {
    warn('ripple package not found, skipping server isolation patch')
    return
  }

  let indexContent = readFileSync(serverIndexFile, 'utf8')
  if (indexContent.includes('const rippleSsrStorage =')) {
    log('Ripple server isolation already applied to index.js')
  } else {
    const storageSetup = `
import { AsyncLocalStorage } from 'node:async_hooks';

const rippleSsrStorage = new AsyncLocalStorage();

const defaultContext = () => ({
  active_component: null,
  active_block: null,
  tracking: false,
  active_dependency: null,
  inside_async_track: false,
  current_element: undefined,
  seen_warnings: new Set(),
  clock: 0
});

function getStore() {
  let store = rippleSsrStorage.getStore();
  if (!store) {
    if (!globalThis.__ripple_fallback_store) {
      globalThis.__ripple_fallback_store = defaultContext();
    }
    return globalThis.__ripple_fallback_store;
  }
  return store;
}

const varsToIsolate = [
  'active_component',
  'active_block',
  'tracking',
  'active_dependency',
  'inside_async_track',
  'current_element',
  'seen_warnings',
  'clock'
];

for (const v of varsToIsolate) {
  Object.defineProperty(globalThis, v, {
    get() {
      return getStore()[v];
    },
    set(val) {
      getStore()[v] = val;
    },
    configurable: true
  });
}
`
    const lastImportIdx = indexContent.lastIndexOf('import ')
    const endOfLastImportLine = indexContent.indexOf('\n', lastImportIdx)
    indexContent = indexContent.slice(0, endOfLastImportLine + 1) + storageSetup + indexContent.slice(endOfLastImportLine + 1)

    const renderStartText = 'export async function render(component, passed_in_options = {}) {'
    const renderStartIdx = indexContent.indexOf(renderStartText)
    if (renderStartIdx === -1) {
      warn("Could not find render function in ripple server/index.js")
      exitCode = 1
      return
    }

    const renderBodyStart = renderStartIdx + renderStartText.length - 1
    let bracketCount = 1
    let i = renderBodyStart + 1
    while (bracketCount > 0 && i < indexContent.length) {
      if (indexContent[i] === '{') bracketCount++
      if (indexContent[i] === '}') bracketCount--
      i++
    }
    const renderBodyEnd = i - 1

    const renderBody = indexContent.slice(renderBodyStart + 1, renderBodyEnd)
    const patchedRender = `{
	return rippleSsrStorage.run(defaultContext(), async () => {
		${renderBody}
	});
}`
    indexContent = indexContent.slice(0, renderBodyStart) + patchedRender + indexContent.slice(renderBodyEnd + 1)

    const vars = [
      'active_block',
      'active_component',
      'tracking',
      'active_dependency',
      'inside_async_track',
      'current_element',
      'seen_warnings',
      'clock'
    ]

    for (const v of vars) {
      const regex = new RegExp(`\\b${v}\\b`, 'g')
      indexContent = indexContent.replace(regex, '__' + v)
    }

    indexContent = indexContent.replace('export let __active_component = null;', 'export let active_component = null;')
    indexContent = indexContent.replace('export let __active_block = null;', 'export let active_block = null;')
    indexContent = indexContent.replace('export let __tracking = false;', 'export let tracking = false;')

    writeFileSync(serverIndexFile, indexContent, 'utf8')
    log('Patched Ripple server index.js for request isolation')
  }

  let blocksContent = readFileSync(serverBlocksFile, 'utf8')
  if (blocksContent.includes('__active_block') && !blocksContent.includes('\tactive_block,\n')) {
    log('Ripple server isolation already applied to blocks.js')
  } else {
    // Remove isolated variables from imports list first so they fallback to globalThis lookup
    blocksContent = blocksContent.replace('\tactive_block,\n', '')
    blocksContent = blocksContent.replace('\tactive_component,\n', '')

    const vars = [
      'active_block',
      'active_component',
      'tracking',
      'active_dependency',
      'inside_async_track',
      'current_element',
      'seen_warnings',
      'clock'
    ]
    for (const v of vars) {
      const regex = new RegExp(`\\b${v}\\b`, 'g')
      blocksContent = blocksContent.replace(regex, '__' + v)
    }

    writeFileSync(serverBlocksFile, blocksContent, 'utf8')
    log('Patched Ripple server blocks.js for request isolation')
  }
}
function patchRippleSetNullBlock() {
  const runtimeFile = resolveRipplePackage('src/runtime/internal/client/runtime.js')
  if (!runtimeFile) {
    warn('ripple client runtime not found, skipping set() null-block patch')
    return
  }
  let src = readFileSync(runtimeFile, 'utf-8')
  if (src.includes('/* patch: null-block guard */')) {
    log('Ripple set() null-block guard already applied')
    return
  }
  // Patch 1: guard against null block in teardown check
  src = src.replace(
    'if ((tracked_block.f & CONTAINS_TEARDOWN) !== 0) {',
    'if (tracked_block !== null && (tracked_block.f & CONTAINS_TEARDOWN) !== 0) { /* patch: null-block guard */'
  )
  // Patch 2: guard against null block in schedule_update call
  src = src.replace(
    'schedule_update(tracked_block);',
    'if (tracked_block !== null) schedule_update(tracked_block); /* patch: null-block guard */'
  )
  writeFileSync(runtimeFile, src, 'utf-8')
  log('Patched Ripple set() — null-block guard applied')
}
function patchVikeClientRouting() {
  const target = resolveVike('dist/client/runtime-client-routing/renderPageClient.js')
  if (!target) { warn('vike client router not found'); return }
  let src = readFileSync(target, 'utf-8')
  if (src.includes('vike-ripple nav guard')) { log('Vike client routing guard already applied'); return }
  // After changeUrl() + execHookOnRenderClient(), verify the page actually rendered.
  // onRenderClient stamps #root dataset with the pageId on success; if missing, hard-nav.
  const marker = `    if (!isErrorPage && !isFirstRender && !onRenderClientError) {
        // vike-ripple nav guard: verify rendering took effect
        const root = document.getElementById('root');
        if (root && root.dataset.vikeRendered !== pageContext.pageId) {
            window.location.href = urlOriginal;
            return;
        }
    }`
  // Insert after the onRenderClientError block that calls onError
  const orig = `        if (!isErrorPage)
                return;`
  // We target the specific onRenderClientError return, not the onHydrationEnd one
  const fullOrig = `    if (onRenderClientError) {
            await onError(onRenderClientError);
            if (!isErrorPage)
                return;
        }`
  const fullRep = `    if (onRenderClientError) {
            await onError(onRenderClientError);
            if (!isErrorPage)
                return;
        }${marker}`
  const result = src.replace(fullOrig, fullRep)
  if (result === src) { warn('Could not patch Vike renderPageClient'); exitCode = 1; return }
  writeFileSync(target, result, 'utf-8')
  log('Patched Vike client routing with render-verification guard')
}
log('Applying patches...')
patchVikeExtensions()
patchRippleDirect()
patchRippleApply()
patchRippleServer()
patchRippleSetNullBlock()
patchVikeClientRouting()
log('Done')
process.exit(exitCode)
