// Builds the hero lab and screenshots each path: `node Scripts/hero_shots.mjs [outDir] [cls...]`.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
const out = process.argv[2] ?? 'test-results', only = process.argv.slice(3);
const bundle = await build({ entryPoints: [new URL('./hero_lab.mjs', import.meta.url).pathname], bundle: true, write: false, format: 'iife' });
const html = `<!doctype html><meta charset="utf-8"><body><script>${bundle.outputFiles[0].text}</script>`;
const server = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const cls of only.length ? only : ['bloom', 'bog', 'hex', 'wild']) for (const [view, extra] of [['front', ''], ['back', ''], ['close', '&i=0'], ['close', '&i=2']]) {
    const page = await browser.newPage({ viewport: { width: view === 'close' ? 520 : 1200, height: view === 'close' ? 520 : 800 } });
    page.on('pageerror', e => console.log('ERR', cls, e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?cls=${cls}&view=${view}${extra}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await page.screenshot({ path: `${out}/lab-${cls}-${view}${extra.replace(/\D/g, '')}.png` });
    await page.close();
  }
} finally { await browser.close(); server.close(); }
