// test/browser-smoke.js
// E2E browser smoke test for Pelotonman. Requires a Chromium-family browser.
//
//   node test/browser-smoke.js [path-to-browser-binary]
//
// It starts its own static server, drives the UI, and (when SHOT_DIR is set)
// saves screenshots for the design docs.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8124;
const SHOT_DIR = process.env.SHOT_DIR ? path.resolve(process.env.SHOT_DIR) : null;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

async function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = path.join(ROOT, urlPath);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          res.writeHead(404); res.end('not found'); return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        const data = await fs.readFile(filePath);
        res.end(data);
      } catch (e) {
        res.writeHead(404); res.end('not found');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

function findBrowser(arg) {
  if (arg) return arg;
  const candidates = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates[0];
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  await fs.mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function clickByText(page, selector, text) {
  await page.evaluate((selector, text) => {
    const btns = Array.from(document.querySelectorAll(selector));
    const btn = btns.find((b) => b.textContent.includes(text));
    if (btn) btn.click();
  }, selector, text);
}

async function main() {
  const browserArg = process.argv[2];
  const executablePath = findBrowser(browserArg);

  const server = await startServer();
  console.log(`Server on http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 60000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  console.log('goto');
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => { window.alert = () => {}; });

  await shot(page, '01-start');
  console.log('start shot');

  // Select UAE team and start career.
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.team-row')).find((r) => r.dataset.team === 'UAE Team Emirates');
    if (row) row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log('career started');

  await shot(page, '02-inbox');
  console.log('inbox shot');

  // Navigate through screens.
  const screens = ['squad', 'race-plan', 'calendar', 'series', 'grand-tours', 'transfers', 'finances', 'team-board'];
  for (const s of screens) {
    console.log('screen', s);
    await clickByText(page, '#sidebar button', s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
    await new Promise((r) => setTimeout(r, 300));
    await shot(page, `03-${s}`);
  }

  // Go to pre-race and roll out.
  console.log('continue pre-race');
  await page.click('#continue-btn');
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, '04-pre-race');

  // Roll out then capture a live race frame before running instant.
  console.log('roll out');
  await clickByText(page, 'button', 'Roll out');
  await new Promise((r) => setTimeout(r, 600));
  await shot(page, '04b-live-race');
  console.log('instant');
  await clickByText(page, 'button[data-speed]', 'Instant');
  await new Promise((r) => setTimeout(r, 1500));
  await shot(page, '05-full-time');
  console.log('full time shot');

  // Advance several weeks.
  for (let i = 0; i < 3; i++) {
    console.log('advance', i);
    await page.click('#continue-btn');
    await new Promise((r) => setTimeout(r, 300));
    await page.click('#continue-btn');
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log('assertions');

  // Assertions.
  await clickByText(page, '#sidebar button', 'Series');
  await new Promise((r) => setTimeout(r, 300));
  const hudText = await page.$eval('#hud', (el) => el.textContent);
  if (!hudText.includes('UAE')) throw new Error(`HUD did not show UAE: ${hudText}`);

  const seriesRows = await page.$$eval('#screen-content table.grid tr', (trs) => trs.length);
  if (seriesRows < 24) throw new Error(`Series table too short: ${seriesRows}`);

  console.log('HUD:', hudText);
  console.log('Series rows:', seriesRows);
  console.log('Console errors:', errors.length);
  if (errors.length) console.log(errors);

  await browser.close();
  server.close();

  if (errors.length > 0) {
    throw new Error(`Browser smoke failed with ${errors.length} console errors`);
  }
  console.log('Browser smoke passed.');
}

main().catch((e) => {
  console.error('Browser smoke failed:', e.message);
  process.exit(1);
});
