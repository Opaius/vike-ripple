# Contributing

## Project structure

```
vike-ripple/
├── create-vike-ripple/        — Scaffold generator
│   └── src/index.js           — single-file generator
├── vike-ripple/               — Core integration
│   ├── src/
│   │   ├── hooks/             — usePageContext, useHydrated, useData, useConfig
│   │   ├── integration/       — onRenderHtml, onRenderClient, getHeadSetting
│   │   ├── components/        — Config, Head, ClientOnly
│   │   └── setup.js           — CLI setup (patches Vike + Ripple)
│   └── docs/quirks.md         — Known issues and fixes
├── vike-ripple-pandacss/      — Panda CSS integration
│   └── src/
│       ├── setup.js           — CLI setup (Panda @layer patch)
│       ├── panda-plugin.js    — parser:before hook for .tsrx extraction
│       └── tsrx-to-tsx.js     — .tsrx → TSX transform
└── vike-ripple-tailwindcss/   — Tailwind CSS integration
    └── src/
        ├── setup.js           — CLI setup (tailwind @import patch)
        └── index.js           — Vite plugin
```

## How packages work together

1. **Core** (`vike-ripple`) patches Vike + Ripple to support `.tsrx` files, server isolation, and client routing.
2. **Style plugins** (`vike-ripple-tailwindcss`, `vike-ripple-pandacss`) each patch the Ripple plugin's CSS transform to inject the right `@import`/`@layer` reference for their framework.
3. Running `vike-ripple setup` first, then a style plugin setup, is required. The style plugin's setup detects and replaces the previous patch.

## Making changes

- Each package is self-contained in its directory.
- Bump the version in `package.json` before publishing.
- Update `docs/quirks.md` with any new bugs, fixes, or caveats.
- Update the root `README.md` if adding or renaming packages.

## Testing

```bash
# Create a test project from local source
node create-vike-ripple/src/index.js test-app --style tailwind

# SSR test
cd test-app && npx vike dev &
curl -s http://localhost:3000/ | grep -o 'Hello'

# Click routing test (puppeteer-core required)
npm i puppeteer-core
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

## Publishing to npm

Packages are published individually from their directories:

```sh
cd <package-dir> && npm publish
```

Ensure you're logged in as `cioky` (`npm whoami`) before publishing.
