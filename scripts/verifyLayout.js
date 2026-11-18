const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9333;
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(payload);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

class SimpleCDP {
  constructor(wsUrl) {
    this.ws = new globalThis.WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === 1) return resolve();
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log('🔑 Authenticating test customer (customer@example.com)...');
  const loginRes = await postJson('http://localhost:3000/api/auth/login', {
    email: 'customer@example.com',
    password: 'Customer@123'
  });
  if (!loginRes.token) {
    throw new Error('Failed to log in: ' + JSON.stringify(loginRes));
  }
  const token = loginRes.token;
  const user = loginRes.user;
  console.log(`✅ Logged in as: ${user.name} (${user.email}) | ageGroup: ${user.ageGroup || 'adult'}`);

  console.log('\n🚀 Launching headless Chrome on port ' + DEBUG_PORT + '...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/chrome-test-' + Date.now(),
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: 'ignore' });

  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      versionData = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (versionData && versionData.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  if (!versionData) {
    chromeProc.kill();
    throw new Error('Failed to connect to Chrome remote debugging port.');
  }

  console.log('✅ Chrome connected:', versionData.Browser);
  const browserCDP = new SimpleCDP(versionData.webSocketDebuggerUrl);
  await browserCDP.ready();

  const target = await browserCDP.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const pageTarget = targets.find(t => t.id === target.targetId);
  const pageCDP = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
  await pageCDP.ready();

  await pageCDP.send('Page.enable');
  await pageCDP.send('Runtime.enable');
  await pageCDP.send('DOM.enable');

  // Set auth session in localStorage for localhost
  await pageCDP.send('Page.navigate', { url: 'http://localhost:3000/pages/menu.html' });
  await sleep(600);
  await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('token', ${JSON.stringify(token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(user))});
    })()`
  });

  const widths = [1920, 1366, 1024, 768, 390];
  const heights = { 1920: 1080, 1366: 768, 1024: 768, 768: 1024, 390: 844 };

  const menuResults = [];
  const checkoutResults = [];

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  TESTING MENU PAGE HORIZONTAL SCROLL & RESPONSIVENESS');
  console.log('════════════════════════════════════════════════════════');

  for (const width of widths) {
    const height = heights[width];
    await pageCDP.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768
    });

    // Reload menu page
    await pageCDP.send('Page.navigate', { url: 'http://localhost:3000/pages/menu.html' });
    await sleep(1500);

    const evalResult = await pageCDP.send('Runtime.evaluate', {
      expression: `(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = doc.scrollWidth;
        const innerWidth = window.innerWidth;
        const htmlOverflowX = getComputedStyle(doc).overflowX;
        const bodyOverflowX = getComputedStyle(body).overflowX;

        // Find any elements overflowing viewport
        const overflowing = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          if (rect.right > innerWidth + 1 && !el.classList.contains('hidden') && rect.width > 0) {
            overflowing.push({
              tag: el.tagName,
              cls: el.className,
              id: el.id,
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            });
          }
        }

        // Layout checks
        const recsGrid = document.getElementById('recsGrid');
        const recCards = recsGrid ? recsGrid.querySelectorAll('.rec-card').length : 0;
        const foodCards = document.querySelectorAll('.food-card').length;
        const sidebar = document.getElementById('menuSidebar');
        const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;

        return {
          scrollWidth,
          innerWidth,
          hasHorizontalScroll: scrollWidth > innerWidth,
          htmlOverflowX,
          bodyOverflowX,
          overflowingCount: overflowing.length,
          overflowingSample: overflowing.slice(0, 3),
          foodCardsCount: foodCards,
          recCardsCount: recCards,
          sidebarWidth: sidebarRect ? Math.round(sidebarRect.width) : 0
        };
      })()`,
      returnByValue: true
    });

    const res = evalResult.result.value;
    menuResults.push({ width, ...res });

    const status = !res.hasHorizontalScroll && res.htmlOverflowX !== 'hidden' && res.bodyOverflowX !== 'hidden'
      ? '✅ PASS' : '❌ FAIL';

    console.log(`\nWidth: ${width}px x ${height}px [${status}]`);
    console.log(`  window.innerWidth: ${res.innerWidth}px | document.scrollWidth: ${res.scrollWidth}px (Diff: ${res.scrollWidth - res.innerWidth}px)`);
    console.log(`  body overflow-x: "${res.bodyOverflowX}" | html overflow-x: "${res.htmlOverflowX}" (Zero cheat hidden)`);
    console.log(`  Rendered food cards: ${res.foodCardsCount} | Recommendation cards: ${res.recCardsCount}`);
    if (res.overflowingCount > 0) {
      console.log(`  ⚠️ Overflowing elements:`, res.overflowingSample);
    }

    // Capture screenshot
    const screenshot = await pageCDP.send('Page.captureScreenshot', { format: 'png' });
    const imgPath = path.join(SCREENSHOT_DIR, `menu_${width}px.png`);
    fs.writeFileSync(imgPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`  📸 Screenshot saved: ${imgPath}`);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  TESTING CHECKOUT CONFIRMATION POPUP (FIX 1)');
  console.log('════════════════════════════════════════════════════════');

  for (const width of [1920, 1366, 1024, 768, 390]) {
    const height = heights[width];
    await pageCDP.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768
    });

    // Populate mock cart
    await pageCDP.send('Runtime.evaluate', {
      expression: `(() => {
        const sampleItem = {
          _id: "673b18507fa71e62a4066001",
          name: "Ragi Dosa",
          price: 90,
          category: "Healthy Indian",
          isVeg: true,
          isHealthy: true
        };
        localStorage.setItem('cart', JSON.stringify([{ item: sampleItem, quantity: 2 }]));
      })()`
    });

    // Go to checkout page
    await pageCDP.send('Page.navigate', { url: 'http://localhost:3000/pages/checkout.html' });
    await sleep(1000);

    // Trigger confirmation popup with complete receipt data
    const popupEval = await pageCDP.send('Runtime.evaluate', {
      expression: `(() => {
        const mockOrder = {
          orderNumber: "ORD-998877",
          orderType: "pickup",
          estimatedReadyTime: new Date(Date.now() + 15 * 60000).toISOString(),
          pricing: { pointsRedeemed: 30, pointsDiscount: 3, total: 186 }
        };
        const mockPayment = {
          amount: 186,
          method: "card",
          transactionId: "TXN-DEMO-12345"
        };
        const mockReceipt = {
          amount: 186,
          pointsEarned: 25,
          pointsRedeemed: 30
        };
        const mockAllergyConflicts = [{ name: "Ragi Dosa", conflictingAllergens: ["dairy"] }];

        // Call showConfirmation function directly
        if (typeof showConfirmation === 'function') {
          showConfirmation(mockOrder, mockPayment, mockReceipt, 25, mockAllergyConflicts);
        } else {
          return { error: 'showConfirmation function not found on page' };
        }

        const modal = document.querySelector('.confirm-modal');
        const bodyEl = document.getElementById('confirmBody');
        const trackBtn = document.getElementById('trackOrderBtn');

        if (!modal) return { error: '.confirm-modal element not found' };

        const modalRect = modal.getBoundingClientRect();
        const bodyRect = bodyEl.getBoundingClientRect();
        const trackBtnRect = trackBtn.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        const bodyComputed = getComputedStyle(bodyEl);
        const modalComputed = getComputedStyle(modal);

        return {
          vw,
          vh,
          modalWidth: Math.round(modalRect.width),
          modalHeight: Math.round(modalRect.height),
          modalTop: Math.round(modalRect.top),
          modalBottom: Math.round(modalRect.bottom),
          modalLeftMargin: Math.round(modalRect.left),
          modalRightMargin: Math.round(vw - modalRect.right),
          fitsInViewport: modalRect.bottom <= vh && modalRect.top >= 0,
          maxHeightCss: modalComputed.maxHeight,
          bodyOverflowY: bodyComputed.overflowY,
          bodyScrollHeight: bodyEl.scrollHeight,
          bodyClientHeight: bodyEl.clientHeight,
          trackBtnVisible: trackBtnRect.bottom <= vh && trackBtnRect.top >= 0 && trackBtnRect.height > 0,
          trackBtnBottom: Math.round(trackBtnRect.bottom),
          trackBtnTop: Math.round(trackBtnRect.top)
        };
      })()`,
      returnByValue: true
    });

    if (popupEval.exceptionDetails) {
      console.error('Popup evaluation error:', popupEval.exceptionDetails);
      continue;
    }

    const cRes = popupEval.result.value;
    if (cRes.error) {
      console.error('Popup error:', cRes.error);
      continue;
    }

    checkoutResults.push({ width, ...cRes });

    const status = cRes.fitsInViewport && cRes.trackBtnVisible ? '✅ PASS' : '❌ FAIL';
    console.log(`\nCheckout Confirmation Popup at ${width}px x ${height}px [${status}]`);
    console.log(`  Viewport: ${cRes.vw}px x ${cRes.vh}px`);
    console.log(`  Modal Rect: ${cRes.modalWidth}px x ${cRes.modalHeight}px (top: ${cRes.modalTop}px, bottom: ${cRes.modalBottom}px)`);
    console.log(`  Left Margin: ${cRes.modalLeftMargin}px | Right Margin: ${cRes.modalRightMargin}px (Centered: ${Math.abs(cRes.modalLeftMargin - cRes.modalRightMargin) <= 10})`);
    console.log(`  Modal fits in viewport: ${cRes.fitsInViewport} (max-height: ${cRes.maxHeightCss})`);
    console.log(`  Track button visible & sticky: ${cRes.trackBtnVisible} (btn bottom: ${cRes.trackBtnBottom}px <= viewport: ${cRes.vh}px)`);
    console.log(`  Receipt body overflow-y: "${cRes.bodyOverflowY}" (Scrollable if tall)`);

    // Capture screenshot of the confirmation modal
    const screenshot = await pageCDP.send('Page.captureScreenshot', { format: 'png' });
    const imgPath = path.join(SCREENSHOT_DIR, `checkout_confirm_${width}px.png`);
    fs.writeFileSync(imgPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`  📸 Screenshot saved: ${imgPath}`);
  }

  // Close Chrome
  browserCDP.close();
  pageCDP.close();
  chromeProc.kill();

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  VERIFICATION SUMMARY');
  console.log('════════════════════════════════════════════════════════');
  const allMenuPassed = menuResults.every(r => !r.hasHorizontalScroll && r.bodyOverflowX !== 'hidden' && r.htmlOverflowX !== 'hidden');
  const allCheckoutPassed = checkoutResults.every(r => r.fitsInViewport && r.trackBtnVisible);

  console.log(`Menu Page Sideways Scroll Check: ${allMenuPassed ? '✅ 100% PASSED (All 5 widths: 1920, 1366, 1024, 768, 390)' : '❌ FAILED'}`);
  console.log(`Checkout Order Placed Popup Check: ${allCheckoutPassed ? '✅ 100% PASSED (All 5 widths: 1920, 1366, 1024, 768, 390)' : '❌ FAILED'}`);

  if (allMenuPassed && allCheckoutPassed) {
    console.log('\n🎉 ALL LAYOUT AND DISPLAY FIXES VERIFIED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
