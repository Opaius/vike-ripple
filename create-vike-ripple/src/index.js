#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

// --- arg parse ---
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(`
create-vike-ripple — Scaffold a Vike + Ripple TS project

Usage:
  create-vike-ripple [name] [options]

Options:
  --style <name>    CSS framework: tailwind (default), pandacss, none
  --cloudflare      Add Cloudflare Workers configuration
  --remult          Add Remult ORM (DO-based realtime with CF, SSE without)
  --help, -h        Show this help message

Examples:
  create-vike-ripple my-app
  create-vike-ripple my-app --style pandacss
  create-vike-ripple my-app --cloudflare
  create-vike-ripple my-app --remult
  create-vike-ripple my-app --remult --cloudflare
`);
	process.exit(0);
}

let name = null;
let style = 'tailwind';
let cloudflare = false;
let remult = false;

for (let i = 0; i < args.length; i++) {
	if (args[i] === '--style' && args[i + 1]) { style = args[++i]; continue; }
	if (args[i] === '--cloudflare') { cloudflare = true; continue; }
	if (args[i] === '--remult') { remult = true; continue; }
	if (!args[i].startsWith('--') && !name) name = args[i];
}
if (!name && args.length && !args[0].startsWith('--')) name = args[0];
if (!name) name = 'my-vike-app';
if (!['tailwind', 'pandacss', 'none'].includes(style)) {
	console.error(`Unknown style "${style}". Use tailwind, pandacss, or none.`);
	process.exit(1);
}

const root = resolve(process.cwd(), name);
mkdirSync(join(root, 'renderer'), { recursive: true });
mkdirSync(join(root, 'src'), { recursive: true });
mkdirSync(join(root, 'pages', 'index'), { recursive: true });

// --- package.json ---
const deps = {
	vike: 'latest',
	'vike-ripple': 'latest',
	'@ripple-ts/vite-plugin': 'latest',
	ripple: 'latest'
};
const devDeps = { vite: 'latest', typescript: 'latest' };
if (style === 'tailwind') {
	deps['vike-ripple-tailwindcss'] = 'latest';
	deps['@tailwindcss/vite'] = 'latest';
}
if (style === 'pandacss') {
	deps['vike-ripple-pandacss'] = 'latest';
	deps['@pandacss/dev'] = 'latest';
}
if (cloudflare) {
	devDeps['@cloudflare/vite-plugin'] = 'latest';
	devDeps['@cloudflare/workers-types'] = 'latest';
	devDeps.wrangler = 'latest';
}
if (remult) {
	deps.remult = 'latest';
	if (cloudflare) {
		deps['remult-partykit'] = 'latest';
		deps.partyserver = '^0.5.0';
		deps.hono = 'latest';
		deps['@vikejs/hono'] = 'latest';
	}
}
const scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview', postinstall: 'ln -sf .. node_modules/@' };
if (style === 'pandacss') {
	scripts.codegen = 'panda codegen';
	scripts.prepare = 'panda codegen';
}
if (cloudflare) {
	scripts.types = 'wrangler types --env-interface Env worker-configuration.d.ts';
}
writeFileSync(join(root, 'package.json'), JSON.stringify({
	name, private: true, type: 'module',
	scripts, dependencies: deps, devDependencies: devDeps
}, null, 2) + '\n');

// --- vite.config.ts ---
const viteImports = [
	`import { defineConfig } from 'vite'`,
	`import { fileURLToPath } from 'node:url'`,
	`import { dirname } from 'node:path'`,
	`import vike from 'vike/plugin'`,
	`import { ripple } from '@ripple-ts/vite-plugin'`,
	`import vikeRipple from 'vike-ripple'`,
];
const vitePlugins = [
	`    vike(),`,
	`    vikeRipple(),`,
	`    ripple({ excludeRippleExternalModules: true }),`,
];
if (cloudflare) {
	viteImports.unshift(`import { cloudflare } from '@cloudflare/vite-plugin'`);
	vitePlugins.unshift(`    cloudflare({ viteEnvironment: { name: 'ssr' } }),`);
}
if (style === 'tailwind') {
	viteImports.push(
		`import vikeRippleTailwindcss from 'vike-ripple-tailwindcss'`,
		`import tailwindcss from '@tailwindcss/vite'`
	);
	vitePlugins.push(`    vikeRippleTailwindcss(),`, `    tailwindcss(),`);
}
if (style === 'pandacss') {
	viteImports.push(`import vikeRipplePandacss from 'vike-ripple-pandacss'`);
	vitePlugins.push(`    vikeRipplePandacss(),`);
}
const vitExtras = [];
if (cloudflare) vitExtras.push(`  environments: { ssr: { consumer: 'server' } },`);
if (style === 'pandacss') vitExtras.push(`  css: { postcss: './postcss.config.js' },`);
writeFileSync(join(root, 'vite.config.ts'), [
	...viteImports, ``,
	`const __dirname = dirname(fileURLToPath(import.meta.url))`,
	`export default defineConfig({`,
	`  resolve: { alias: { '@': __dirname } },`,
	...vitExtras,
	`  optimizeDeps: { exclude: ['ripple'] },`,
	`  plugins: [`, ...vitePlugins, `  ],`, `})`, ``
].join('\n'));

// --- tsconfig.json ---
const tsPaths = { '@/*': ['./*'] };
if (style === 'pandacss') tsPaths['@styled-system/*'] = ['./styled-system/*'];
writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
	compilerOptions: {
		strict: true, module: 'ESNext', moduleResolution: 'bundler',
		target: 'ESNext', jsx: 'preserve', jsxImportSource: 'ripple',
		esModuleInterop: true, isolatedModules: true,
		verbatimModuleSyntax: true, skipLibCheck: true,
		...(cloudflare ? { types: ['@cloudflare/workers-types'] } : { types: ['vike/client'] }),
		paths: tsPaths
	},
	include: ['**/*.ts', '**/*.tsx', '**/*.tsrx']
}, null, 2) + '\n');

// --- renderer/+config.ts ---
writeFileSync(join(root, 'renderer', '+config.ts'), [
	`export default {`,
	`  extends: ['import:vike-ripple/config:default'],`,
	`  server: true,`,
	`}`, ``
].join('\n'));

// --- pages/+Layout.tsrx ---
if (style === 'pandacss') {
	writeFileSync(join(root, 'pages', '+Layout.tsrx'), [
		`import { type JSX } from 'ripple'`,
		`import { css } from '@/styled-system/css'`,
		`import '@/src/styles.css'`,
		``,
		`export function Layout({ children }: { children: JSX.Element }) @{`,
		`  <div class={css({ minH: 'screen', bg: 'white', color: 'gray.900' })}>`,
		`    <nav class={css({ display: 'flex', gap: '4', borderBottom: '1px', px: '4', py: '3', fontSize: 'sm' })}>`,
		`      <a href="/" data-vike-link class={css({ fontWeight: 600, color: 'gray.700', _hover: { color: 'black' } })}>Home</a>`,
		`      <a href="/about" data-vike-link class={css({ color: 'gray.500', _hover: { color: 'black' } })}>About</a>`,
		`    </nav>`,
		`    {children}`,
		`  </div>`,
		`}`,
		``
	].join('\n'));
} else if (style === 'none') {
	writeFileSync(join(root, 'pages', '+Layout.tsrx'), [
		`import { type JSX } from 'ripple'`, ``,
		`export function Layout({ children }: { children: JSX.Element }) @{`,
		`  <div>`, `    {children}`, `  </div>`,
		`}`, ``
	].join('\n'));
} else {
	writeFileSync(join(root, 'pages', '+Layout.tsrx'), [
		`import { type JSX } from 'ripple'`, ``,
		`export function Layout({ children }: { children: JSX.Element }) @{`,
		`  <div class="min-h-screen bg-white text-gray-900">`,
		`    <nav class="flex gap-4 border-b px-4 py-3 text-sm">`,
		`      <a href="/" data-vike-link class="font-semibold text-gray-700 hover:text-black">Home</a>`,
		`      <a href="/about" data-vike-link class="text-gray-500 hover:text-black">About</a>`,
		`    </nav>`, `    {children}`, `  </div>`,
		`}`, ``
	].join('\n'));
}

// --- pages/index/+Page.tsrx ---
if (style === 'pandacss') {
	writeFileSync(join(root, 'pages', 'index', '+Page.tsrx'), [
		`import { css } from '@/styled-system/css'`, ``,
		`export function Page() @{`,
		`  <>`,
		`    <head><title>Home</title></head>`,
		`    <section class={css({ minH: 'screen', display: 'flex', flexDir: 'column', alignItems: 'center', justifyContent: 'center', gap: '4', p: '8' })}>`,
		`      <h1 class={css({ fontSize: '4xl', fontWeight: 'bold' })}>Hello, Vike + Ripple!</h1>`,
		`      <p class={css({ fontSize: 'lg', color: 'blue.600' })}>With Panda CSS</p>`,
		`    </section>`,
		`  </>`,
		`}`, ``
	].join('\n'));
} else if (style === 'tailwind') {
	writeFileSync(join(root, 'pages', 'index', '+Page.tsrx'), [
		`import '../../tailwind.css'`, ``,
		`export function Page() @{`,
		`  <>`,
		`    <head><title>Home</title></head>`,
		`    <section class="min-h-screen flex flex-col items-center justify-center gap-4 p-8">`,
		`      <h1 class="text-4xl font-bold">Hello, Vike + Ripple!</h1>`,
		`      <p class="text-lg text-blue-600">With Tailwind CSS v4</p>`,
		`    </section>`,
		`  </>`,
		`}`, ``
	].join('\n'));
} else {
	writeFileSync(join(root, 'pages', 'index', '+Page.tsrx'), [
		`export function Page() @{`,
		`  <>`,
		`    <head><title>Home</title></head>`,
		`    <section>`, `      <h1>Hello, Vike + Ripple!</h1>`, `    </section>`,
		`  </>`,
		`}`, ``
	].join('\n'));
}

// --- pages/about/+Page.tsrx ---
mkdirSync(join(root, 'pages', 'about'), { recursive: true });
if (style === 'pandacss') {
	writeFileSync(join(root, 'pages', 'about', '+Page.tsrx'), [
		`import { css } from '@/styled-system/css'`, ``,
		`export function Page() @{`,
		`  <>`,
		`    <head><title>About</title></head>`,
		`    <section class={css({ mx: 'auto', maxW: '2xl', p: '8' })}>`,
		`      <h1 class={css({ fontSize: '3xl', fontWeight: 'bold', mb: '4' })}>About</h1>`,
		`      <p class={css({ color: 'gray.600' })}>This scaffold was created by create-vike-ripple.</p>`,
		`      <p class={css({ color: 'gray.600' })}>Scaffolded with Panda CSS + Ripple TS plugin.</p>`,
		`    </section>`,
		`  </>`,
		`}`, ``
	].join('\n'));
} else if (style !== 'none') {
	writeFileSync(join(root, 'pages', 'about', '+Page.tsrx'), [
		`export function Page() @{`,
		`  <>`,
		`    <head><title>About</title></head>`,
		`    <section class="mx-auto max-w-2xl p-8">`,
		`      <h1 class="text-3xl font-bold mb-4">About</h1>`,
		`      <p class="text-gray-600">This scaffold was created by create-vike-ripple.</p>`,
		`    </section>`,
		`  </>`,
		`}`, ``
	].join('\n'));
} else {
	writeFileSync(join(root, 'pages', 'about', '+Page.tsrx'), [
		`export function Page() @{`,
		`  <>`,
		`    <head><title>About</title></head>`,
		`    <section>`, `      <h1>About</h1>`,
		`      <p>This scaffold was created by create-vike-ripple.</p>`, `    </section>`,
		`  </>`,
		`}`, ``
	].join('\n'));
}

// --- style-specific files ---
if (style === 'tailwind') {
	writeFileSync(join(root, 'tailwind.css'), [`@import "tailwindcss";`, ``].join('\n'));
}
if (style === 'pandacss') {
	writeFileSync(join(root, 'panda.config.ts'), [
		`import { defineConfig } from '@pandacss/dev'`,
		`import { pluginRipple } from 'vike-ripple-pandacss/panda-plugin'`, ``,
		`export default defineConfig({`,
		`  preflight: true,`,
		`  include: ['./pages/**/*.{tsrx,tsx}', './renderer/**/*.{ts,tsx}'],`,
		`  exclude: [],`,
		`  plugins: [pluginRipple()],`,
		`  theme: { extend: {} },`,
		`  outdir: 'styled-system',`,
		`})`, ``
	].join('\n'));
	writeFileSync(join(root, 'postcss.config.js'), [
		`export default { plugins: { '@pandacss/dev/postcss': {} } }`, ``
	].join('\n'));
	writeFileSync(join(root, 'src', 'styles.css'), [
		`@layer reset, base, tokens, recipes, utilities;`, ``
	].join('\n'));
}

// --- CF basic ---
if (cloudflare && !(remult && cloudflare)) {
	mkdirSync(join(root, '.wrangler'), { recursive: true });
	writeFileSync(join(root, 'wrangler.jsonc'), JSON.stringify({
		$schema: 'node_modules/wrangler/config-schema.json',
		name, main: 'vike:server-entry',
		compatibility_date: '2026-06-01',
		compatibility_flags: ['nodejs_compat']
	}, null, 2) + '\n');
	writeFileSync(join(root, '.gitignore'), `node_modules/\ndist/\n.wrangler/\n*.log\n.env\n`);
}

// --- Remult + CF ---
if (remult && cloudflare) {
	mkdirSync(join(root, 'server'), { recursive: true });
	mkdirSync(join(root, 'lib'), { recursive: true });
	mkdirSync(join(root, '.wrangler'), { recursive: true });
	writeFileSync(join(root, 'wrangler.jsonc'), JSON.stringify({
		$schema: 'node_modules/wrangler/config-schema.json', name, main: '+server.ts',
		compatibility_date: '2026-06-01', compatibility_flags: ['nodejs_compat'],
		d1_databases: [{ binding: 'DB', database_name: name, database_id: 'your-database-id-here' }],
		durable_objects: {
			bindings: [
				{ name: 'REMULT_ROOM', class_name: 'RemultPubSubRoom' },
				{ name: 'REMULT_LIVE_QUERY_STORAGE', class_name: 'RemultLiveQueryStorageRoom' }
			]
		},
		migrations: [{ tag: 'v1', new_sqlite_classes: ['RemultPubSubRoom', 'RemultLiveQueryStorageRoom'] }],
		vars: {
			BETTER_AUTH_URL: 'http://localhost:3000',
			BETTER_AUTH_SECRET: 'dev-secret-change-in-production!!',
			MAX_CONNECTIONS_PER_SHARD: '100',
			REALTIME_LIVE_QUERY_ROOM_MODE: 'global'
		}
	}, null, 2) + '\n');
	writeFileSync(join(root, '+server.ts'), [
		`import { RemultLiveQueryStorageRoom, RemultPartyRoom, resolveRoomIdFromChannel } from 'remult-partykit/durable-object'`,
		`import { app } from './server/hono'`, ``,
		`class PubSubRoom extends RemultPartyRoom<Cloudflare.Env> {`,
		`  static options = { hibernate: false }`,
		`  override options = { resolveRoomId: resolveRoomIdFromChannel };`,
		`  override async onError(_connection: import('partyserver').Connection, error: unknown) {`,
		`    console.error('PubSubRoom error:', error)`,
		`  }`,
		`}`, ``,
		`export default { fetch: app.fetch }`,
		`export { RemultLiveQueryStorageRoom, PubSubRoom as RemultPubSubRoom }`, ``
	].join('\n'));
	writeFileSync(join(root, 'server', 'hono.ts'), [
		`import { Hono } from 'hono'`,
		`import { D1DataProvider } from 'remult/remult-d1'`,
		`import { remultApi } from 'remult/remult-hono'`,
		`import { RemultPartySubscriptionServer } from 'remult-partykit/server'`,
		`import vike from '@vikejs/hono'`, ``,
		`const app = new Hono()`,
		`app.use('/api/*', remultApi({`,
		`  dataProvider: async () => {`,
		`    const env = process.env as unknown as Cloudflare.Env`,
		`    return new D1DataProvider(env.DB)`,
		`  },`,
		`  subscriptionServer: () => new RemultPartySubscriptionServer(),`,
		`  buildEntities: () => [],`,
		`  getUser: () => undefined,`,
		`}))`,
		`app.use('/party/*', async (c) => {`,
		`  const env = c.env as Cloudflare.Env`,
		`  return env.REMULT_ROOM.fetch(c.req.raw)`,
		`})`,
		`vike(app, [])`,
		`export { app }`, ``
	].join('\n'));
	writeFileSync(join(root, 'lib', 'remult-client.ts'), [
		`import { RemultPartySubscriptionClient } from 'remult-partykit'`,
		`import { remult } from 'remult'`,
		`export function initRemultRealtime(host: string) {`,
		`  const client = new RemultPartySubscriptionClient({`,
		`    getSocketUrl: (roomName: string) => {`,
		`      const wsHost = host.replace(/^http/, 'ws')`,
		`      return \`\${wsHost}/party/remult?room=\${roomName}\``,
		`    },`,
		`  })`,
		`  remult.apiClient.subscriptionClient = client`,
		`}`, ``
	].join('\n'));
	writeFileSync(join(root, '.gitignore'), `node_modules/\ndist/\n.wrangler/\n*.log\n.env\n`);
}

// --- Remult only ---
if (remult && !cloudflare) {
	mkdirSync(join(root, 'server'), { recursive: true });
	writeFileSync(join(root, 'server', 'remult.ts'), [
		`import { remult } from 'remult'`,
		`export const api = remult({ entities: [], getUser: async () => undefined })`, ``
	].join('\n'));
}

// --- install ---
let label = `style: ${style}`;
if (cloudflare) label += ', CF Workers';
if (remult) label += ', Remult';
console.log(`\n  \x1b[1mCreated ${name}  (${label})\x1b[22m`);
console.log(`\n  Installing dependencies...`);
execSync('npm install', { cwd: root, stdio: 'inherit' });
console.log(`\n  Running vike-ripple setup...`);
execSync('npx --yes vike-ripple setup', { cwd: root, stdio: 'inherit' });
if (style === 'tailwind') {
	console.log(`\n  Running vike-ripple-tailwindcss setup...`);
	execSync('npx --yes vike-ripple-tailwindcss setup', { cwd: root, stdio: 'inherit' });
}
if (style === 'pandacss') {
	console.log(`\n  Running vike-ripple-pandacss setup...`);
	execSync('npx --yes vike-ripple-pandacss setup', { cwd: root, stdio: 'inherit' });
}
if (cloudflare) {
	console.log(`\n  Generating worker types...`);
	execSync('npm run types', { cwd: root, stdio: 'inherit' });
}
console.log(`\n  \x1b[1mDone!\x1b[22m`);
console.log(`  cd ${name} && npm run dev`);
