#!/usr/bin/env node
/**
 * @cioky/vike-pandacss setup — enables Panda CSS @apply in Ripple <style> blocks.
 *
 * Run once:  npx @cioky/vike-pandacss setup
 * Or add to project's package.json:  "postinstall": "@cioky/vike-pandacss setup"
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const projectRoot = process.cwd();
let exitCode = 0;

function log(msg) {
	console.log('[@cioky/vike-pandacss]', msg);
}
function warn(msg) {
	console.warn('[@cioky/vike-pandacss]', msg);
}

function patchRippleApply() {
	const target = resolveModule('@ripple-ts/vite-plugin/src/index.js');
	if (!target) {
		warn('@ripple-ts/vite-plugin not found — skipping. Run npm install first.');
		return;
	}

	const src = readFileSync(target, 'utf-8');
	if (src.includes('PANDA_PATCH_APPLY')) {
		log('@apply patch already applied');
		return;
	}

	// Case 1: @cioky/vike-core's tailwind patch is already present — replace it
	if (src.includes('TW_PATCH_APPLY') || src.includes('@import "tailwindcss"')) {
		const twPatched =
			'\t\t\t\t\t\t// TW_PATCH_APPLY: @apply support\n' +
			'\t\t\t\t\t\tcss = \'@import "tailwindcss" layer(reference);\\n\' + css;\n' +
			"\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, 'style');\n" +
			'\t\t\t\t\t\tcssCache.set(cssId, css);';
		const pandaPatched =
			'\t\t\t\t\t\t// PANDA_PATCH_APPLY: bring panda CSS layer into scope for @apply\n' +
			"\t\t\t\t\t\tcss = '@layer reset, base, tokens, recipes, utilities;\\n' + css;\n" +
			"\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, 'style');\n" +
			'\t\t\t\t\t\tcssCache.set(cssId, css);';
		const result = src.replace(twPatched, pandaPatched);
		if (result === src) {
			warn('Could not replace tailwind patch with Panda patch');
			exitCode = 1;
			return;
		}
		writeFileSync(target, result, 'utf-8');
		log('Replaced tailwind @apply patch with Panda CSS @apply patch');
		return;
	}

	// Case 2: fresh install, no tailwind patch — apply panda directly
	const orig =
		'\t\t\t\t\tif (css) {\n' +
		"\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, 'style');\n" +
		'\t\t\t\t\t\tcssCache.set(cssId, css);';
	const patched =
		'\t\t\t\t\tif (css) {\n' +
		'\t\t\t\t\t\t// PANDA_PATCH_APPLY: bring panda CSS layer into scope for @apply\n' +
		"\t\t\t\t\t\tcss = '@layer reset, base, tokens, recipes, utilities;\\n' + css;\n" +
		"\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, 'style');\n" +
		'\t\t\t\t\t\tcssCache.set(cssId, css);';

	const result = src.replace(orig, patched);
	if (result === src) {
		warn('Could not find target in Ripple plugin');
		exitCode = 1;
		return;
	}

	writeFileSync(target, result, 'utf-8');
	log('Patched Ripple plugin for Panda CSS @apply support in <style> blocks');
}

function resolveModule(rel) {
	const p = join(projectRoot, 'node_modules', rel);
	if (existsSync(p)) return p;
	try {
		const r = createRequire(join(projectRoot, 'package.json'));
		return r.resolve(rel);
	} catch {
		return null;
	}
}

log('Applying Panda CSS @apply patch...');
patchRippleApply();
log('Done');
process.exit(exitCode);
