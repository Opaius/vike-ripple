#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

// --- arg parse ---
const args = process.argv.slice(2);
let name = null;
let style = 'tailwind';
let cloudflare = false;
let remult = false;

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
const scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' };
if (style === 'pandacss') {
	scripts.codegen = 'panda codegen';
	scripts.prepare = 'panda codegen';
}
if (cloudflare) {
	scripts.types =
		'wrangler types --env-interface Env worker-configuration.d.ts';
}
writeFileSync(
	join(root, 'package.json'),
	JSON.stringify(
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
	) + '\n'
);

// --- vite.config.ts ---
const imports = [
	`import { defineConfig } from 'vite'`,
	`import vike from 'vike/plugin'`,
	`import { ripple } from '@ripple-ts/vite-plugin'`,
	`import vikeRipple from 'vike-ripple'`
];
const plugins = [
	`    vike(),`,
	`    vikeRipple(),`,
	`    ripple({ excludeRippleExternalModules: true }),`
];
if (cloudflare) {
	imports.unshift(`import { cloudflare } from '@cloudflare/vite-plugin'`);
	plugins.unshift(`    cloudflare({ viteEnvironment: { name: 'ssr' } }),`);
}
if (style === 'tailwind') {
	imports.push(
		`import vikeRippleTailwindcss from 'vike-ripple-tailwindcss'`,
		`import tailwindcss from '@tailwindcss/vite'`
	);
	plugins.push(`    vikeRippleTailwindcss(),`, `    tailwindcss(),`);
}
if (style === 'pandacss') {
	imports.push(`import vikeRipplePandacss from 'vike-ripple-pandacss'`);
	plugins.push(`    vikeRipplePandacss(),`);
}
const viteExtras = [];
if (cloudflare)
	viteExtras.push(`  environments: { ssr: { consumer: 'server' } },`);
if (style === 'pandacss')
	viteExtras.push(`  css: { postcss: './postcss.config.js' },`);
writeFileSync(
	join(root, 'vite.config.ts'),
	[
		...imports,
		``,
		`export default defineConfig({`,
		...viteExtras,
		`  optimizeDeps: { exclude: ['ripple'] },`,
		`  plugins: [`,
		...plugins,
		`  ],`,
		`})`,
		``
	].join('\n')
);

// --- tsconfig.json ---
const tsPaths = { '@/*': ['./*'] };
if (style === 'pandacss') tsPaths['@styled-system/*'] = ['./styled-system/*'];
writeFileSync(
	join(root, 'tsconfig.json'),
	JSON.stringify(
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
				verbatimModuleSyntax: true,
				skipLibCheck: true,
				...(cloudflare
					? { types: ['@cloudflare/workers-types'] }
					: { types: ['vike/client'] }),
				paths: tsPaths
			},
			include: ['**/*.ts', '**/*.tsx', '**/*.tsrx']
		},
		null,
		2
	) + '\n'
);

// --- renderer/+config.ts ---
writeFileSync(
	join(root, 'renderer', '+config.ts'),
	[
		`export default {`,
		`  extends: ['import:vike-ripple/config:default'],`,
		`  server: true,`,
		`}`,
		``
	].join('\n')
);

// --- pages/+Layout.tsrx ---
const layoutNav =
	style === 'none'
		? []
		: [
				`    <nav class="flex gap-4 border-b px-4 py-3 text-sm">`,
				`      <a href="/" data-vike-link class="font-semibold text-gray-700 hover:text-black">Home</a>`,
				`      <a href="/about" data-vike-link class="text-gray-500 hover:text-black">About</a>`,
				`    </nav>`
			];
writeFileSync(
	join(root, 'pages', '+Layout.tsrx'),
	[
		`import { type JSX } from 'ripple'`,
		``,
		`export function Layout({ children }: { children: JSX.Element }) @{`,
		`  <div class="${style === 'none' ? '' : 'min-h-screen bg-white text-gray-900'}">`,
		...layoutNav,
		`    {children}`,
		`  </div>`,
		`}`,
		``
	].join('\n')
);

// --- pages/index/+Page.tsrx ---
const pageImport = style === 'tailwind' ? `import '../../tailwind.css'` : null;
writeFileSync(
	join(root, 'pages', 'index', '+Page.tsrx'),
	[
		...(pageImport ? [pageImport, ``] : []),
		`export function Page() @{`,
		`  <>`,
		`    <head><title>Home</title></head>`,
		`    <section${style === 'none' ? '' : ' class="min-h-screen flex flex-col items-center justify-center gap-4 p-8"'}>`,
		`      <h1${style === 'none' ? '' : ' class="text-4xl font-bold"'}>Hello, Vike + Ripple!</h1>`,
		...(style !== 'none'
			? [
					`      <p class="text-lg text-blue-600">With ${style === 'tailwind' ? 'Tailwind CSS v4' : 'Panda CSS'}</p>`
				]
			: []),
		`    </section>`,
		`  </>`,
		`}`,
		``
	].join('\n')
);

// --- pages/about/+Page.tsrx ---
mkdirSync(join(root, 'pages', 'about'), { recursive: true });
writeFileSync(
	join(root, 'pages', 'about', '+Page.tsrx'),
	[
		`export function Page() @{`,
		`  <>`,
		`    <head><title>About</title></head>`,
		`    <section class="${style === 'none' ? '' : 'mx-auto max-w-2xl p-8'}">`,
		`      <h1 class="${style === 'none' ? '' : 'text-3xl font-bold mb-4'}">About</h1>`,
		`      <p class="${style === 'none' ? '' : 'text-gray-600'}">This scaffold was created by create-vike-ripple.</p>`,
		...(style === 'pandacss'
			? [
					`      <p class="text-gray-600">Scaffolded with Panda CSS + Ripple TS plugin.</p>`
				]
			: []),
		`    </section>`,
		`  </>`,
		`}`,
		``
	].join('\n')
);

// --- style-specific files ---
if (style === 'tailwind')
	writeFileSync(
		join(root, 'tailwind.css'),
		[`@import "tailwindcss";`, ``].join('\n')
	);
if (style === 'pandacss') {
	writeFileSync(
		join(root, 'panda.config.ts'),
		[
			`import { defineConfig } from '@pandacss/dev'`,
			`import { pluginRipple } from 'vike-ripple-pandacss/panda-plugin'`,
			``,
			`export default defineConfig({`,
			`  preflight: true,`,
			`  include: ['./pages/**/*.{tsrx,tsx}', './renderer/**/*.{ts,tsx}'],`,
			`  exclude: [],`,
			`  plugins: [pluginRipple()],`,
			`  theme: { extend: {} },`,
			`  outdir: 'styled-system',`,
			`})`,
			``
		].join('\n')
	);
	writeFileSync(
		join(root, 'postcss.config.js'),
		[`export default { plugins: { '@pandacss/dev/postcss': {} } }`, ``].join(
			'\n'
		)
	);
}

// --- CF basic ---
if (cloudflare && !(remult && cloudflare)) {
	mkdirSync(join(root, '.wrangler'), { recursive: true });
	writeFileSync(
		join(root, 'wrangler.jsonc'),
		JSON.stringify(
			{
				$schema: 'node_modules/wrangler/config-schema.json',
				name,
				main: 'vike:server-entry',
				compatibility_date: '2026-06-01',
				compatibility_flags: ['nodejs_compat']
			},
			null,
			2
		) + '\n'
	);
	writeFileSync(
		join(root, '.gitignore'),
		`node_modules/\ndist/\n.wrangler/\n*.log\n.env\n`
	);
}

// --- Remult + CF ---
if (remult && cloudflare) {
	mkdirSync(join(root, 'server'), { recursive: true });
	mkdirSync(join(root, 'lib'), { recursive: true });
	mkdirSync(join(root, '.wrangler'), { recursive: true });

	writeFileSync(
		join(root, 'wrangler.jsonc'),
		JSON.stringify(
			{
				$schema: 'node_modules/wrangler/config-schema.json',
				name,
				main: '+server.ts',
				compatibility_date: '2026-06-01',
				compatibility_flags: ['nodejs_compat'],
				d1_databases: [
					{
						binding: 'DB',
						database_name: name,
						database_id: 'your-database-id-here'
					}
				],
				durable_objects: {
					bindings: [
						{ name: 'REMULT_ROOM', class_name: 'RemultPubSubRoom' },
						{
							name: 'REMULT_LIVE_QUERY_STORAGE',
							class_name: 'RemultLiveQueryStorageRoom'
						}
					]
				},
				migrations: [
					{
						tag: 'v1',
						new_sqlite_classes: [
							'RemultPubSubRoom',
							'RemultLiveQueryStorageRoom'
						]
					}
				],
				vars: {
					BETTER_AUTH_URL: 'http://localhost:3000',
					BETTER_AUTH_SECRET: 'dev-secret-change-in-production!!',
					MAX_CONNECTIONS_PER_SHARD: '100',
					REALTIME_LIVE_QUERY_ROOM_MODE: 'global'
				}
			},
			null,
			2
		) + '\n'
	);

	writeFileSync(
		join(root, '+server.ts'),
		[
			`import { RemultLiveQueryStorageRoom, RemultPartyRoom, resolveRoomIdFromChannel } from 'remult-partykit/durable-object'`,
			`import { app } from './server/hono'`,
			``,
			`class PubSubRoom extends RemultPartyRoom<Cloudflare.Env> {`,
			`  static options = { hibernate: false }`,
			`    override options = { resolveRoomId: resolveRoomIdFromChannel };
  override async onError(_connection: import('partyserver').Connection, error: unknown) {`,
			`    console.error('PubSubRoom error:', error)`,
			`  }`,
			`}`,
			``,
			`export default { fetch: app.fetch }`,
			`export { RemultLiveQueryStorageRoom, PubSubRoom as RemultPubSubRoom }`,
			``
		].join('\n')
	);

	writeFileSync(
		join(root, 'server', 'hono.ts'),
		[
			`import { Hono } from 'hono'`,
			`import { D1DataProvider } from 'remult/remult-d1'`,
			`import { remultApi } from 'remult/remult-hono'`,
			`import { RemultPartySubscriptionServer } from 'remult-partykit/server'`,
			`import vike from '@vikejs/hono'`,
			``,
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
			`export { app }`,
			``
		].join('\n')
	);

	writeFileSync(
		join(root, 'lib', 'remult-client.ts'),
		[
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
			`}`,
			``
		].join('\n')
	);

	writeFileSync(
		join(root, '.gitignore'),
		`node_modules/\ndist/\n.wrangler/\n*.log\n.env\n`
	);
}

// --- Remult only ---
if (remult && !cloudflare) {
	mkdirSync(join(root, 'server'), { recursive: true });
	writeFileSync(
		join(root, 'server', 'remult.ts'),
		[
			`import { remult } from 'remult'`,
			`export const api = remult({ entities: [], getUser: async () => undefined })`,
			``
		].join('\n')
	);
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
	execSync('npx --yes vike-ripple-tailwindcss setup', {
		cwd: root,
		stdio: 'inherit'
	});
}
if (style === 'pandacss') {
	console.log(`\n  Running vike-ripple-pandacss setup...`);
	execSync('npx --yes vike-ripple-pandacss setup', {
		cwd: root,
		stdio: 'inherit'
	});
}
if (cloudflare) {
	console.log(`\n  Generating worker types...`);
	execSync('npm run types', { cwd: root, stdio: 'inherit' });
}

console.log(`\n  \x1b[1mDone!\x1b[22m`);
console.log(`  cd ${name} && npm run dev`);
