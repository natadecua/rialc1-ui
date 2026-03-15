const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3000';
const SHOTS = [
  { url: `${BASE_URL}/`, file: 'docs/screenshots/01-map-overview.png' },
  { url: `${BASE_URL}/view_lamesa.html`, file: 'docs/screenshots/02-potree-main.png' },
  { url: `${BASE_URL}/lamesa_potree_viewer.html`, file: 'docs/screenshots/03-potree-alt-viewer.png' },
  { url: `${BASE_URL}/tree_point_viewer.html?treeId=1`, file: 'docs/screenshots/04-tree-point-viewer.png' },
];

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/status`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not respond at ${BASE_URL} within ${timeoutMs}ms`);
}

async function launchBrowserWithFallback() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("Executable doesn't exist") || message.includes('browserType.launch')) {
      execSync('npx playwright install chromium', { stdio: 'inherit' });
      return chromium.launch({ headless: true });
    }
    throw error;
  }
}

async function run() {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await waitForServer();

  const browser = await launchBrowserWithFallback();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  const results = [];

  for (const shot of SHOTS) {
    try {
      await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: shot.file, type: 'png', fullPage: false });
      results.push({ file: shot.file, captured: fs.existsSync(shot.file), error: null });
    } catch (error) {
      results.push({ file: shot.file, captured: false, error: String(error?.message || error) });
    }
  }

  await context.close();
  await browser.close();

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((item) => !item.captured);
  if (failed.length) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
