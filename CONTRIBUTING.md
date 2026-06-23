# Contributing

## Project structure

```
vike-ripple/
├── create-vike-ripple/        — Scaffold generator
├── vike-ripple/               — Core integration
├── vike-ripple-pandacss/      — Panda CSS integration
└── vike-ripple-tailwindcss/   — Tailwind CSS integration
```

Each package is self-contained in its directory. See each package's README for specifics, and `vike-ripple/docs/quirks.md` for known issues and fixes.

## Making changes

- Each package is self-contained in its directory.
- Bump the version in `package.json` before releasing.
- Update `vike-ripple/docs/quirks.md` with any new bugs, fixes, or caveats.
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
cd test-app && npx vike dev &
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
