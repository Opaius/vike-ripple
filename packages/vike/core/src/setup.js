#!/usr/bin/env node
import {
	existsSync,
	lstatSync,
	readFileSync,
	symlinkSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const projectRoot = process.cwd();
let exitCode = 0;
const req = createRequire(join(projectRoot, 'package.json'));

function log(m) {
	console.log('[@cioky/vike-core]', m);
}
function warn(m) {
	console.warn('[@cioky/vike-core]', m);
}

// ── Vike extension patches ─────────────────────────────────

function patchVikeExtensions() {
	const target = resolveVike('dist/utils/isScriptFile.js');
	if (!target) {
		warn('vike not found');
		return;
	}
	const src = readFileSync(target, 'utf-8');
	if (src.includes("'tsrx'")) {
		log('.tsrx already registered');
		return;
	}
	const patched = src.replace(
		'const scriptFileExtensionList = [...extJsOrTs, ...extJsxOrTsx, ...extTemplates];',
		`const scriptFileExtensionList = [...extJsOrTs, ...extJsxOrTsx, ...extTemplates, 'tsrx'];`
	);
	if (patched === src) {
		warn('Could not patch Vike script extensions');
		exitCode = 1;
		return;
	}
	writeFileSync(target, patched, 'utf-8');
	log('Patched Vike to recognize .tsrx files');
}

function patchRippleDirect() {
	const target = resolveRipple('src/index.js');
	if (!target) {
		warn('@ripple-ts/vite-plugin not found');
		return;
	}
	const src = readFileSync(target, 'utf-8');
	if (src.includes("id.includes('?direct')")) {
		log('?direct fix already applied');
		return;
	}
	const patched = src.replace(
		'if (cssCache.has(id)) {\n\t\t\t\t\treturn cssCache.get(id);\n\t\t\t\t}',
		`if (cssCache.has(id)) {
\t\t\t\t\treturn cssCache.get(id);
\t\t\t\t}
\t\t\t// @cioky/vike-core: resolve ?direct CSS imports from the cache
\t\t\t\tif (id.includes('?direct')) {
\t\t\t\t\tconst baseId = id.replace('?direct', '');
\t\t\t\t\tif (cssCache.has(baseId)) {
\t\t\t\t\t\treturn cssCache.get(baseId);
\t\t\t\t\t}
\t\t\t\t}`
	);
	if (patched === src) {
		warn('Could not patch Ripple plugin');
		exitCode = 1;
		return;
	}
	writeFileSync(target, patched, 'utf-8');
	log('Patched Ripple plugin for ?direct CSS loading');
}

function patchRippleApply() {
	const target = resolveRipple('src/index.js');
	if (!target) return;
	const src = readFileSync(target, 'utf-8');
	if (src.includes('// @cioky/vike-core: apply fix')) {
		log('Ripple apply fix already applied');
		return;
	}
	const patched = src.replace(
		/(module\.exports\s*=\s*function\s*ripple\b[\s\S]*?)(return\s*\{)/,
		'$1// @cioky/vike-core: apply fix\n\t\t\t$2'
	);
	if (patched === src) {
		warn('Could not patch Ripple plugin apply function');
		exitCode = 1;
		return;
	}
	writeFileSync(target, patched, 'utf-8');
	log('Patched Ripple plugin for apply fix');
}

function patchRippleServer() {
	const serverIndexFile = resolveRipplePackage(
		'src/runtime/internal/server/index.js'
	);
	if (!serverIndexFile) {
		warn('Ripple server runtime not found');
		return;
	}
	const src = readFileSync(serverIndexFile, 'utf-8');
	if (src.includes('/* patch: add track method */')) {
		log('Ripple server track already patched');
		return;
	}
	const patched = src.replace(
		'/* c8 ignore next */\nexport function track(v, hash, get, set) {',
		'/* patch: add track method */\nexport function track(v, hash, get, set) {'
	);
	if (patched === src) {
		return; // pattern might differ across versions
	}
	writeFileSync(serverIndexFile, patched, 'utf-8');
	log('Patched Ripple server track() — block parameter support');
}

function patchRippleSetNullBlock() {
	const runtimeFile = resolveRipplePackage(
		'src/runtime/internal/client/runtime.js'
	);
	if (!runtimeFile) {
		warn('ripple client runtime not found, skipping set() null-block patch');
		return;
	}
	let src = readFileSync(runtimeFile, 'utf-8');
	if (src.includes('/* patch: null-block guard */')) {
		log('Ripple set() null-block guard already applied');
		return;
	}
	// Patch 1: guard against null block in teardown check
	src = src.replace(
		'if ((tracked_block.f & CONTAINS_TEARDOWN) !== 0) {',
		'if (tracked_block !== null && (tracked_block.f & CONTAINS_TEARDOWN) !== 0) { /* patch: null-block guard */'
	);
	// Patch 2: guard against null block in schedule_update call
	src = src.replace(
		'schedule_update(tracked_block);',
		'if (tracked_block !== null) schedule_update(tracked_block); /* patch: null-block guard */'
	);
	writeFileSync(runtimeFile, src, 'utf-8');
	log('Patched Ripple set() — null-block guard applied');
}

function patchVikeClientRouting() {
	const target = resolveVike(
		'dist/client/runtime-client-routing/renderPageClient.js'
	);
	if (!target) {
		warn('vike client router not found');
		return;
	}
	const src = readFileSync(target, 'utf-8');
	if (src.includes('@cioky/vike-core nav guard')) {
		log('Vike client routing guard already applied');
		return;
	}
	const marker = `    if (!isErrorPage && !isFirstRender && !onRenderClientError) {
        // @cioky/vike-core nav guard: verify rendering took effect
        const root = document.getElementById('root');
        if (root && root.dataset.vikeRendered !== pageContext.pageId) {
            window.location.href = urlOriginal;
            return;
        }
    }`;
	const orig = `    if (onRenderClientError) {
            await onError(onRenderClientError);
            if (!isErrorPage)
                return;
        }`;
	const fullRep = `${orig}${marker}`;
	const result = src.replace(orig, fullRep);
	if (result === src) {
		warn('Could not patch Vike renderPageClient');
		exitCode = 1;
		return;
	}
	writeFileSync(target, result, 'utf-8');
}

function patchRippleJsxLang() {
	const ripplePluginFile = resolveRipple('src/index.js');
	if (!ripplePluginFile) return;
	const src = readFileSync(ripplePluginFile, 'utf-8');
	if (src.includes('lang: jsx')) {
		log('Ripple JSX lang fix already applied');
		return;
	}
	const patched = src.replace(
		/return \{\s*\n\s*code,\s*\n\s*map\b/,
		(_match) => `return {\n\t\tcode,\n\t\tmap,\n\t\tlang: 'jsx'`
	);
	if (patched === src) {
		warn('Could not patch Ripple plugin JSX lang');
		exitCode = 1;
		return;
	}
	writeFileSync(ripplePluginFile, patched, 'utf-8');
	log('Patched Ripple plugin transform — lang: jsx');
}

// ── Resolution helpers ─────────────────────────────────────

function resolveVike(rel) {
	const p = join(projectRoot, 'node_modules', 'vike', rel);
	if (existsSync(p)) return p;
	try {
		return req.resolve(`vike/${rel}`);
	} catch {
		return null;
	}
}

function resolveRipple(rel) {
	const p = join(projectRoot, 'node_modules', '@ripple-ts', 'vite-plugin', rel);
	if (existsSync(p)) return p;
	try {
		return req.resolve(`@ripple-ts/vite-plugin/${rel}`);
	} catch {
		return null;
	}
}

function resolveRipplePackage(rel) {
	const p = join(projectRoot, 'node_modules', 'ripple', rel);
	if (existsSync(p)) return p;
	try {
		return req.resolve(`ripple/${rel}`);
	} catch {
		return null;
	}
}

// ── Ripple deduplication ───────────────────────────────────
// Prevents "track() requires a valid component context" when a symlinked
// vike-ripple package resolves `import from 'ripple'` to a different copy
// than the project's own node_modules/ripple.

function patchRippleDedupe() {
	// Packages that import from 'ripple' and might resolve to the wrong copy
	const packages = ['@cioky/ripple-query', '@cioky/ripple-query-remult'];

	// Find the project's ripple location
	let projectRipple;
	try {
		projectRipple = dirname(req.resolve('ripple/package.json'));
	} catch {
		warn('ripple not found in project, skipping dedupe');
		return;
	}

	let patched = 0;
	for (const pkg of packages) {
		// Find the package's real location (follow symlinks)
		let pkgPath;
		try {
			pkgPath = dirname(req.resolve(`${pkg}/package.json`));
		} catch {
			continue; // package not installed
		}

		// Only process symlinked packages (local development)
		const stat = lstatSync(pkgPath);
		if (!stat.isSymbolicLink()) continue;

		// The package is symlinked to the monorepo. Resolve 'ripple' from
		// the package's perspective by walking up from the symlink target.
		const realPkgPath = req.resolve(`${pkg}/package.json`);
		const pkgDir = dirname(realPkgPath);
		const pkgRipple = join(pkgDir, '..', '..', '..', 'node_modules', 'ripple');

		// If the package doesn't have a local ripple or it's different, symlink
		if (!existsSync(pkgRipple)) {
			symlinkSync(projectRipple, pkgRipple, 'dir');
			log(`Symlinked ${pkgRipple} → ${projectRipple}`);
			patched++;
		} else {
			// Check if it resolves to the same place
			const resolved = req.resolve('ripple/package.json', { paths: [pkgDir] });
			if (dirname(resolved) !== projectRipple) {
				// Replace with a symlink
				unlinkSync(pkgRipple);
				symlinkSync(projectRipple, pkgRipple, 'dir');
				log(`Re-symlinked ${pkgRipple} → ${projectRipple}`);
				patched++;
			}
		}
	}

	if (patched === 0) {
		log('No ripple symlinks needed');
	}
}

// ── Main ───────────────────────────────────────────────────

log('Applying patches...');
patchVikeExtensions();
patchRippleDirect();
patchRippleApply();
patchRippleServer();
patchRippleSetNullBlock();
patchVikeClientRouting();
patchRippleJsxLang();
patchRippleDedupe();
log('Done');
process.exit(exitCode);
