const { chromium } = require('playwright');
const { spawn } = require('child_process');

async function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server.js'], { cwd: process.cwd() });
    let ready = false;

    const handleData = (data) => {
      const text = data.toString();
      process.stdout.write(`[server] ${text}`);
      if (!ready && text.includes('Server listening at')) {
        ready = true;
        resolve(child);
      }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', (data) => {
      process.stderr.write(`[server:err] ${data}`);
    });

    child.on('error', (error) => {
      if (!ready) {
        reject(error);
      } else {
        console.error('[server] error:', error);
      }
    });

    child.on('exit', (code) => {
      console.log(`[server] exited with code ${code}`);
      if (!ready) {
        reject(new Error('Server exited before becoming ready.'));
      }
    });
  });
}

(async () => {
  const serverProcess = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (error) => {
    console.error('[browser:pageerror]', error);
  });

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });

  await page.waitForTimeout(5000);

  const loadingState = await page.evaluate(() => {
    const indicator = document.getElementById('loadingIndicator');
    if (!indicator) {
      return { exists: false };
    }
    const style = window.getComputedStyle(indicator);
    return {
      exists: true,
      hiddenClass: indicator.classList.contains('hidden'),
      display: style.display,
      opacity: style.opacity,
      text: indicator.textContent?.trim() || '',
    };
  });

  console.log('Loading indicator state:', loadingState);

  await browser.close();
  serverProcess.kill('SIGTERM');
})();
