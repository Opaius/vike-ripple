#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tplDir = join(__dirname, '../templates');

// ── Arg parse ─────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(`@cioky/vike-create — Scaffold a Vike + Ripple TS project

Usage:  @cioky/vike-create [name] [options]

Options:
  --style <name>    CSS: tailwind (default), pandacss, none
  --cloudflare      Add Cloudflare Workers config
  --remult          Add Remult ORM
  --betterauth      Add Better Auth (requires --remult)
  --help, -h        Show this help`);
	process.exit(0);
}

let name = null,
	style = 'tailwind',
	cloudflare = false,
	remult = false,
	betterauth = false;
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--style' && args[i + 1]) {
		style = args[++i];
		continue;
	}
	if (args[i] === '--cloudflare') {
		cloudflare = true;
		continue;
	}
	if (args[i] === '--remult') {
		remult = true;
		continue;
	}
	if (args[i] === '--betterauth') {
		betterauth = true;
		continue;
	}
	if (!args[i].startsWith('--') && !name) name = args[i];
}
name = name || args[0] || 'my-vike-app';
if (!['tailwind', 'pandacss', 'none'].includes(style)) {
	console.error(`Unknown style "${style}". Use tailwind, pandacss, or none.`);
	process.exit(1);
}
if (betterauth && !remult) {
	console.error('--betterauth requires --remult.');
	process.exit(1);
}

const root = resolve(process.cwd(), name);

// ── Create dirs ───────────────────────────────────────────
mkdirSync(join(root, 'renderer'), { recursive: true });
mkdirSync(join(root, 'src'), { recursive: true });
mkdirSync(join(root, 'pages', 'index'), { recursive: true });
mkdirSync(join(root, 'pages', 'about'), { recursive: true });
if (remult && cloudflare) {
	mkdirSync(join(root, 'server'), { recursive: true });
	mkdirSync(join(root, 'lib'), { recursive: true });
}
if (betterauth) {
	mkdirSync(join(root, 'entities'), { recursive: true });
	mkdirSync(join(root, 'pages', 'login'), { recursive: true });
	mkdirSync(join(root, 'pages', 'register'), { recursive: true });
	mkdirSync(join(root, 'pages', 'dashboard'), { recursive: true });
	mkdirSync(join(root, 'server'), { recursive: true });
}
if (cloudflare) mkdirSync(join(root, '.wrangler'), { recursive: true });

// ── Copy templates ───────────────────────────────────────
function copyTemplates(dir) {
	const src = join(tplDir, dir);
	if (!existsSync(src)) return;
	cpSync(src, root, {
		recursive: true,
		filter: (s) => !s.includes('node_modules')
	});
}
copyTemplates('base');
if (style === 'pandacss') copyTemplates('pandacss');
else if (style === 'none') copyTemplates('none');
if (remult && cloudflare) copyTemplates('remult-cf');
else if (remult) copyTemplates('remult');
if (betterauth) copyTemplates('betterauth');

// ── Dynamic: package.json ─────────────────────────────────
const deps = {
	vike: '0.4.259',
	'@cioky/vike-core': '0.5.6',
	'@ripple-ts/vite-plugin': '0.3.85',
	ripple: '0.3.85'
};
const devDeps = {
	vite: '8.1.0',
	typescript: '5.9.3',
	'@tsrx/typescript-plugin': '0.3.85'
};

if (style === 'tailwind') {
	deps['@cioky/vike-tailwindcss'] = 'latest';
	deps['@tailwindcss/vite'] = 'latest';
}
if (style === 'pandacss') {
	deps['@cioky/vike-pandacss'] = '0.1.0';
	deps['@pandacss/dev'] = '1.11.3';
}
if (cloudflare) {
	devDeps['@cloudflare/vite-plugin'] = '1.42.2';
	devDeps['@cloudflare/workers-types'] = '4.20260624.1';
	devDeps.wrangler = '4.104.0';
}
if (remult) {
	deps.remult = '3.3.13';
	if (cloudflare) {
		deps['remult-partykit'] = '1.1.0';
		deps.partyserver = '0.5.8';
		deps.hono = '4.12.27';
		deps['@vikejs/hono'] = '0.2.1';
	}
}
if (betterauth) {
	deps['better-auth'] = '1.6.20';
	deps['@nerdfolio/remult-better-auth'] = '0.4.3';
}

const scripts = {
	dev: 'vite',
	build: 'vite build',
	preview: 'vite preview',
	check: 'tsrx-tsc --noEmit',
	postinstall: 'rm -f node_modules/~ && ln -sf .. node_modules/~'
};
if (style === 'pandacss') {
	scripts.codegen = 'panda codegen';
	scripts.prepare = 'panda codegen';
}
if (cloudflare)
	scripts.types =
		'wrangler types --env-interface Env worker-configuration.d.ts';

writeFileSync(
	join(root, 'package.json'),
	`${JSON.stringify(
		{
			name,
			private: true,
			type: 'module',
			scripts,
			dependencies: deps,
			devDependencies: devDeps
		},
		null,
		2
	)}\n`
);

// ── Dynamic: vite.config.ts ───────────────────────────────
const imports = [
	`import { defineConfig } from 'vite'`,
	`import { fileURLToPath } from 'node:url'`,
	`import { dirname } from 'node:path'`,
	`import vike from 'vike/plugin'`,
	`import { ripple } from '@ripple-ts/vite-plugin'`,
	`import vikeRipple from '@cioky/vike-core'`
];
const plugins = [
	`    vike(),`,
	`    vikeRipple(),`,
	`    ripple({ excludeRippleExternalModules: true }),`
];
const extras = [];

if (cloudflare) {
	imports.unshift(`import { cloudflare } from '@cloudflare/vite-plugin'`);
	plugins.unshift(`    cloudflare({ viteEnvironment: { name: 'ssr' } }),`);
}
if (style === 'tailwind') {
	imports.push(
		`import vikeRippleTailwindcss from '@cioky/vike-tailwindcss'`,
		`import tailwindcss from '@tailwindcss/vite'`
	);
	plugins.push(`    vikeRippleTailwindcss(),`, `    tailwindcss(),`);
}
if (style === 'pandacss') {
	imports.push(`import vikeRipplePandacss from '@cioky/vike-pandacss'`);
	plugins.push(`    vikeRipplePandacss(),`);
}
if (cloudflare) extras.push(`  environments: { ssr: { consumer: 'server' } },`);
if (style === 'pandacss')
	extras.push(`  css: { postcss: './postcss.config.js' },`);

writeFileSync(
	join(root, 'vite.config.ts'),
	[
		...imports,
		``,
		`const __dirname = dirname(fileURLToPath(import.meta.url))`,
		`export default defineConfig({`,
		`  resolve: { alias: { '~': __dirname } },`,
		...extras,
		`  optimizeDeps: { exclude: ['ripple'] },`,
		`  plugins: [`,
		...plugins,
		`  ],`,
		`})`,
		``
	].join('\n')
);

// ── Dynamic: tsconfig.json ────────────────────────────────
const paths = { '~/*': ['./*'] };
if (style === 'pandacss') paths['~styled-system/*'] = ['./styled-system/*'];

writeFileSync(
	join(root, 'tsconfig.json'),
	`${JSON.stringify(
		{
			compilerOptions: {
				strict: true,
				module: 'ESNext',
				moduleResolution: 'bundler',
				target: 'ESNext',
				jsx: 'preserve',
				jsxImportSource: 'ripple',
				esModuleInterop: true,
				isolatedModules: true,
				experimentalDecorators: true,
				verbatimModuleSyntax: true,
				skipLibCheck: true,
				...(cloudflare
					? { types: ['@cloudflare/workers-types'] }
					: { types: ['vike/client'] }),
				paths
			},
			include: ['**/*.ts', '**/*.tsx', '**/*.tsrx']
		},
		null,
		2
	)}\n`
);

// ── Dynamic: wrangler.jsonc (cloudflare) ──────────────────
if (cloudflare) {
	const wrangler = {
		$schema: 'node_modules/wrangler/config-schema.json',
		name,
		...(remult ? { main: '+server.ts' } : { main: 'vike:server-entry' }),
		compatibility_date: '2026-06-01',
		compatibility_flags: ['nodejs_compat']
	};
	if (remult) {
		wrangler.d1_databases = [
			{
				binding: 'DB',
				database_name: name,
				database_id: 'your-database-id-here'
			}
		];
		wrangler.durable_objects = {
			bindings: [
				{ name: 'REMULT_ROOM', class_name: 'RemultPubSubRoom' },
				{
					name: 'REMULT_LIVE_QUERY_STORAGE',
					class_name: 'RemultLiveQueryStorageRoom'
				}
			]
		};
		wrangler.migrations = [
			{
				tag: 'v1',
				new_sqlite_classes: ['RemultPubSubRoom', 'RemultLiveQueryStorageRoom']
			}
		];
		wrangler.vars = {
			BETTER_AUTH_URL: 'http://localhost:3000',
			BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
			MAX_CONNECTIONS_PER_SHARD: '100',
			REALTIME_LIVE_QUERY_ROOM_MODE: 'global'
		};
	}
	writeFileSync(
		join(root, 'wrangler.jsonc'),
		`${JSON.stringify(wrangler, null, 2)}\n`
	);
	writeFileSync(
		join(root, '.gitignore'),
		`node_modules/\ndist/\n.wrangler/\n*.log\n.env\n`
	);
}

// ── Dynamic: server/hono.ts (with betterauth overrides) ───
if (betterauth && remult && cloudflare) {
	const hono = [
		`import { Hono } from 'hono'`,
		`import { remultApi } from 'remult/remult-hono'`,
		`import { D1DataProvider, D1BindingClient } from 'remult/remult-d1'`,
		`import { SqlDatabase } from 'remult'`,
		`import vike from '@vikejs/hono'`,
		`import { getAuth } from './better-auth'`,
		``,
		`const app = new Hono<{ Variables: { user: unknown; session: unknown } }>()`,
		`let db: D1Database`,
		``,
		`app.use('/api/*', async (c, next) => { db = (c.env as Cloudflare.Env).DB; await next() })`,
		`app.use('/api/auth/*', async (c) => {`,
		`  const env = c.env as Cloudflare.Env`,
		`  const auth = await getAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL)`,
		`  if (!auth) return c.text('Auth not available', 500)`,
		`  return auth.handler(c.req.raw)`,
		`})`,
		`app.route('/api', remultApi({`,
		`  dataProvider: async () => new SqlDatabase(new D1DataProvider(new D1BindingClient(db))),`,
		`  entities: [],`,
		`  getUser: async () => undefined,`,
		`}))`,
		`app.use('/party/*', async (c) => {`,
		`  const env = c.env as Cloudflare.Env`,
		`  const ns = env.REMULT_ROOM`,
		`  return ns.get(ns.idFromName('global')).fetch(c.req.raw)`,
		`})`,
		`vike(app, [])`,
		`export { app }`,
		``
	];
	writeFileSync(join(root, 'server', 'hono.ts'), hono.join('\n'));
}

// ── Dynamic: remult-only server ───────────────────────────
if (remult && !cloudflare && !existsSync(join(root, 'server', 'remult.ts'))) {
	const remultTpl = [
		`import { remult } from 'remult'`,
		`export const api = remult({ entities: [], getUser: async () => undefined })`,
		``
	];
	writeFileSync(join(root, 'server', 'remult.ts'), remultTpl.join('\n'));
}

// ── Install + setup ───────────────────────────────────────
let label = `style: ${style}`;
if (cloudflare) label += ', CF Workers';
if (remult) label += ', Remult';
if (betterauth) label += ', Better Auth';
console.log(`\n  \x1b[1mCreated ${name}  (${label})\x1b[22m`);
console.log(`\n  Installing dependencies...`);
execSync('npm install', { cwd: root, stdio: 'inherit' });
console.log(`\n  Running @cioky/vike-core setup...`);
execSync('npx --yes @cioky/vike-core setup', { cwd: root, stdio: 'inherit' });
if (style === 'tailwind') {
	console.log(`\n  Running @cioky/vike-tailwindcss setup...`);
	execSync('npx --yes @cioky/vike-tailwindcss setup', {
		cwd: root,
		stdio: 'inherit'
	});
}
if (style === 'pandacss') {
	console.log(`\n  Running @cioky/vike-pandacss setup...`);
	execSync('npx --yes @cioky/vike-pandacss setup', {
		cwd: root,
		stdio: 'inherit'
	});
}
if (cloudflare) {
	console.log(`\n  Generating worker types...`);
	execSync('npm run types', { cwd: root, stdio: 'inherit' });
}
if (betterauth) {
	console.log(
		`\n  \x1b[33m⚠ BETTER_AUTH_SECRET was auto-generated in wrangler.jsonc.\x1b[0m`
	);
	console.log(
		`  \x1b[33m  For production, set it as a Wrangler secret:\x1b[0m`
	);
	console.log(`  \x1b[33m  wrangler secret put BETTER_AUTH_SECRET\x1b[0m`);
}
console.log(`\n  \x1b[1mDone!\x1b[22m`);
console.log(`  cd ${name} && npm run dev`);
