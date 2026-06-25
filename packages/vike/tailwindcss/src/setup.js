#!/usr/bin/env node
/**
 * @cioky/vike-tailwindcss setup — enables @apply in Ripple <style> blocks.
 *
 * Run once:  npx @cioky/vike-tailwindcss setup
 * Or add to project's package.json:  "postinstall": "@cioky/vike-tailwindcss setup"
 */
import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = process.cwd();
let exitCode = 0;

function log(msg) {
	console.log('[@cioky/vike-tailwindcss]', msg);
}
function warn(msg) {
	console.warn('[@cioky/vike-tailwindcss]', msg);
}

function patchRippleApply() {
	const target = resolveModule('@ripple-ts/vite-plugin/src/index.js');
	if (!target) {
		warn('@ripple-ts/vite-plugin not found — skipping');
		return;
	}

	let src = readFileSync(target, 'utf-8');
	if (src.includes('TW_PATCH_APPLY')) {
		log('@apply patch already applied');
		return;
	}

	const orig =
		'\t\t\t\t\tif (css) {\n' +
		"\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, 'style');\n" +
		'\t\t\t\t\t\tcssCache.set(cssId, css);';
	const patched =
		'\t\t\t\t\tif (css) {\n' +
		'\t\t\t\t\t\t// TW_PATCH_APPLY: bring tailwindcss into scope for @apply\n' +
		'\t\t\t\t\t\tcss = \'@import "tailwindcss";\\n\' + css;\n' +
		"\t\t\t\t\t\tconst cssId = createVirtualImportId(filename, root, 'style');\n" +
		'\t\t\t\t\t\tcssCache.set(cssId, css);';

	const result = src.replace(orig, patched);
	if (result === src) {
		warn('Could not find target in Ripple plugin');
		exitCode = 1;
		return;
	}

	writeFileSync(target, result, 'utf-8');
	log('Patched Ripple plugin for @apply support in <style> blocks');
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

log('Applying @apply patch...');
patchRippleApply();
log('Done');
process.exit(exitCode);
