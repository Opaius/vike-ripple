# Contributing

Thanks for considering contributing to vike-ripple!

## Project structure

```
packages/
├── vike/
│   ├── core/               — @cioky/vike-core (SSR, streaming, Layout, Head, hooks)
│   ├── tailwindcss/        — @cioky/vike-tailwindcss
│   ├── pandacss/           — @cioky/vike-pandacss
│   └── create/             — @cioky/vike-create (scaffold CLI)
└── ripple/
    ├── transitions/        — @cioky/ripple-transitions
    ├── query/              — @cioky/ripple-query
    └── query-remult/       — @cioky/ripple-query-remult
```

Each package is self-contained in its directory. Each has its own `README.md` for install/setup. See `packages/vike/core/docs/quirks.md` for known issues and design decisions.

## Getting started

```bash
git clone https://github.com/Opaius/vike-ripple.git
cd vike-ripple
```

No build step needed — all packages are plain JavaScript/TypeScript source that gets published directly.

## Making changes

1. Find the package directory relevant to your change
2. Make your changes
3. Test locally (see below)
4. Open a pull request

### Code style

- The repo uses [Biome](https://biomejs.dev) for formatting and linting
- Run `npm run lint` before committing
- Keep functions small, prefer readable over clever

### Updating documentation

- If you fix a bug or discover a caveat, add it to `packages/vike/core/docs/quirks.md`
- If you add or rename a package, update the root `README.md` table

## Testing

### SSR test

```bash
# Create a test project from local source
node packages/vike/create/src/index.js test-app --style tailwind
cd test-app

# Start dev server
npx vike dev &
sleep 3

# Check both pages render
curl -s http://localhost:3000/ | grep -o 'Hello'
curl -s http://localhost:3000/about | grep -o 'About'
```

### Click routing test

```bash
npm i puppeteer-core
cd test-app
npx vike dev &
node --input-type=module -e "
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const p = await b.newPage();
await p.goto('http://localhost:3000/', {waitUntil:'networkidle2',timeout:10000});
await Promise.all([p.waitForNavigation(), p.click('a[href=\"/about\"]')]);
console.log(await p.title());
await b.close();
"
```

### Smoke test all flag combinations

```bash
node packages/vike/create/src/index.js test-tw --style tailwind
node packages/vike/create/src/index.js test-pd --style pandacss
node packages/vike/create/src/index.js test-cf --style tailwind --cloudflare
node packages/vike/create/src/index.js test-rm --style tailwind --remult
node packages/vike/create/src/index.js test-rmcf --style pandacss --remult --cloudflare
cd test-rmcf && npx vite build
```

## Pull request process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run lint` (Biome)
4. Test with at least one SSR + click routing test
5. Open a PR with a clear title and description of what changed and why
6. A maintainer will review and merge

## Issues

- Report bugs via [GitHub Issues](https://github.com/Opaius/vike-ripple/issues)
- Include: what you did, what you expected, what happened, and the output of `npx vike dev`
- Check `packages/vike/core/docs/quirks.md` first — your issue might be known
