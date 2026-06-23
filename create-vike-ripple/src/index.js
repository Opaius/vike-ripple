#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'

// --- arg parse ---
const args = process.argv.slice(2)
let name = null
let style = 'tailwind' // tailwind | pandacss | none

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--style' && args[i + 1]) {
    style = args[++i]
    continue
  }
  if (!args[i].startsWith('--') && !name) name = args[i]
}
// ponytail: first non-flag arg is the project name
if (!name && args.length && !args[0].startsWith('--')) name = args[0]; else if (!name) name = 'my-vike-app'

if (!['tailwind', 'pandacss', 'none'].includes(style)) {
  console.error(`Unknown style "${style}". Use tailwind, pandacss, or none.`)
  process.exit(1)
}

const root = resolve(process.cwd(), name)
mkdirSync(join(root, 'renderer'), { recursive: true })
mkdirSync(join(root, 'src'), { recursive: true })
mkdirSync(join(root, 'pages', 'index'), { recursive: true })

// --- package.json ---
const deps = {
  vike: 'latest',
  'vike-ripple': 'latest',
  '@ripple-ts/vite-plugin': 'latest',
  ripple: 'latest',
}
const devDeps = { vite: 'latest', typescript: 'latest' }

if (style === 'tailwind') {
  deps['vike-ripple-tailwindcss'] = 'latest'
  deps['@tailwindcss/vite'] = 'latest'
}

if (style === 'pandacss') {
  deps['vike-ripple-pandacss'] = 'latest'
  deps['@pandacss/dev'] = 'latest'
}

const scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' }
if (style === 'pandacss') {
  scripts.codegen = 'panda codegen'
  scripts.prepare = 'panda codegen'
}

writeFileSync(join(root, 'package.json'), JSON.stringify({
  name,
  private: true,
  type: 'module',
  scripts,
  dependencies: deps,
  devDependencies: devDeps,
}, null, 2) + '\n')

// --- vite.config.ts ---
const plugins = [
  `    vike(),`,
  `    vikeRipple(),`,
  `    ripple({ excludeRippleExternalModules: true }),`,
]
const imports = [
  `import { defineConfig } from 'vite'`,
  `import vike from 'vike/plugin'`,
  `import { ripple } from '@ripple-ts/vite-plugin'`,
  `import vikeRipple from 'vike-ripple'`,
]

if (style === 'tailwind') {
  imports.push(
    `import vikeRippleTailwindcss from 'vike-ripple-tailwindcss'`,
    `import tailwindcss from '@tailwindcss/vite'`,
  )
  plugins.push(
    `    vikeRippleTailwindcss(),`,
    `    tailwindcss(),`,
  )
}

if (style === 'pandacss') {
  imports.push(
    `import vikeRipplePandacss from 'vike-ripple-pandacss'`,
  )
}

writeFileSync(join(root, 'vite.config.ts'), [
  ...imports,
  ``,
  `export default defineConfig({`,
  `  optimizeDeps: { exclude: ['ripple'] },`,
  ...(style === 'pandacss' ? [`  css: { postcss: './postcss.config.js' },`] : []),
  `  plugins: [`,
  ...plugins,
  `  ],`,
  `})`,
  ``,
].join('\n'))

// --- tsconfig.json ---
writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'preserve',
    jsxImportSource: 'ripple',
    strict: true,
    noEmit: true,
    isolatedModules: true,
    skipLibCheck: true,
  },
  include: ['**/*.ts', '**/*.tsx', '**/*.tsrx'],
}, null, 2) + '\n')

// --- renderer/+config.ts ---
writeFileSync(join(root, 'renderer', '+config.ts'), [
  `export default {`,
  `  extends: ['import:vike-ripple/config:default'],`,
  `}`,
  ``,
].join('\n'))

// --- pages/+Layout.tsrx ---
writeFileSync(join(root, 'pages', '+Layout.tsrx'), [
  `import { type JSX } from 'ripple'`,
  ``,
  `export function Layout({ children }: { children: JSX.Element }) @{`,
  `  <div class="${style === 'none' ? '' : 'min-h-screen bg-white text-gray-900'}">`,
  ...(style === 'none' ? [] : [
    `    <nav class="flex gap-4 border-b px-4 py-3 text-sm">`,
    `      <a href="/" data-vike-link class="font-semibold text-gray-700 hover:text-black">Home</a>`,
    `      <a href="/about" data-vike-link class="text-gray-500 hover:text-black">About</a>`,
    `    </nav>`,
  ]),
  `    {children}`,
  `  </div>`,
  `}`,
  ``,
].join('\n'))

const pageImport = style !== 'none' && style !== 'pandacss' ? `import '../../tailwind.css'` : null
writeFileSync(join(root, 'pages', 'index', '+Page.tsrx'), [
  ...(pageImport ? [pageImport, ``] : []),
  `export function Page() @{`,
  `  <>`,
  `    <head>`,
  `      <title>Home</title>`,
  ...(style === 'pandacss' ? [`      <link rel="stylesheet" href="/styled-system/styles.css" />`] : []),
  `    </head>`,
  `    <section${style === 'none' ? '' : ' class="min-h-screen flex flex-col items-center justify-center gap-4 p-8"'}>`,
  `      <h1${style === 'none' ? '' : ' class="text-4xl font-bold"'}>Hello, Vike + Ripple!</h1>`,
  ...(style !== 'none' ? [`      <p class="text-lg text-blue-600">With ${style === 'tailwind' ? 'Tailwind CSS v4' : 'Panda CSS'}</p>`] : []),
  `    </section>`,
  `  </>`,
  `}`,
  ``,
].join('\n'))

// --- style entry point ---
// --- pages/about/+Page.tsrx ---
mkdirSync(join(root, 'pages', 'about'), { recursive: true })
writeFileSync(join(root, 'pages', 'about', '+Page.tsrx'), [
  `export function Page() @{`,
  `  <>`,
  `    <head>`,
  `      <title>About</title>`,
  ...(style === 'pandacss' ? [`      <link rel="stylesheet" href="/styled-system/styles.css" />`] : []),
  `    </head>`,
  `    <section class="${style === 'none' ? '' : 'mx-auto max-w-2xl p-8'}">`,
  `      <h1 class="${style === 'none' ? '' : 'text-3xl font-bold mb-4'}">About</h1>`,
  `      <p class="${style === 'none' ? '' : 'text-gray-600'}">This scaffold was created by create-vike-ripple.</p>`,
  ...(style === 'pandacss' ? [`      <p class="text-gray-600">Scaffolded with Panda CSS + Ripple TS plugin.</p>`] : []),
  `    </section>`,
  `  </>`,
  `}`,
  ``,
].join('\n'))
if (style === 'tailwind') {
  writeFileSync(join(root, 'tailwind.css'), [
    `@import "tailwindcss";`,
    ``,
  ].join('\n'))
}
// ponytail: --style pandacss wiring is a stub; replace with real vike-ripple-pandacss plugin when available
// ponytail: --style pandacss wiring with vike-ripple-pandacss plugin
if (style === 'pandacss') {
  writeFileSync(join(root, 'panda.config.ts'), [
    `import { defineConfig } from '@pandacss/dev'`,
    `import { pluginRipple } from 'vike-ripple-pandacss/panda-plugin'`,
    ``,
    `export default defineConfig({`,
    `  preflight: true,`,
    `  include: ['./pages/**/*.{tsrx,tsx}', './renderer/**/*.{ts,tsx}'],`,
    `  exclude: [],`,
    `  plugins: [pluginRipple()],`,
    `  theme: {`,
    `    extend: {},`,
    `  },`,
    `  outdir: 'styled-system',`,
    `})`,
    ``,
  ].join('\n'))
  writeFileSync(join(root, 'postcss.config.js'), [
    `export default {`,
    `  plugins: {`,
    `    '@pandacss/dev/postcss': {},`,
    `  },`,
    `}`,
    ``,
  ].join('\n'))
}

// --- install ---
console.log(`\n  \x1b[1mCreated ${name}  (style: ${style})\x1b[22m`)
console.log(`  cd ${name}`)

console.log(`\n  Installing dependencies...`)
execSync('npm install', { cwd: root, stdio: 'inherit' })

console.log(`\n  Running vike-ripple setup...`)
execSync('npx --yes vike-ripple setup', { cwd: root, stdio: 'inherit' })

if (style === 'tailwind') {
  console.log(`\n  Running vike-ripple-tailwindcss setup...`)
  execSync('npx --yes vike-ripple-tailwindcss setup', { cwd: root, stdio: 'inherit' })
}

if (style === 'pandacss') {
  console.log(`\n  Running vike-ripple-pandacss setup...`)
  execSync('npx --yes vike-ripple-pandacss setup', { cwd: root, stdio: 'inherit' })
}

console.log(`\n  \x1b[1mDone!\x1b[22m`)
console.log(`  cd ${name} && npm run dev`)
