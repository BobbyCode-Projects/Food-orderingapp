const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9445;

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
  console.log('🚀 Launching headless Chrome...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--user-data-dir=/tmp/chrome-img-' + Date.now(),
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

  const browserCDP = new SimpleCDP(versionData.webSocketDebuggerUrl);
  await browserCDP.ready();

  const target = await browserCDP.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const pageTarget = targets.find(t => t.id === target.targetId);
  const pageCDP = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
  await pageCDP.ready();

  await pageCDP.send('Page.enable');
  await pageCDP.send('Runtime.enable');

  // Check 1: Menu page cards and images
  console.log('\n--- Checking Menu Page Cards ---');
  await pageCDP.send('Page.navigate', { url: 'http://localhost:3000/pages/menu.html' });
  await sleep(1500);

  const cardCheck = await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('.food-card');
      const loaded = [];
      const failed = [];
      cards.forEach(card => {
        const name = card.querySelector('.food-card-name')?.textContent?.trim() || '';
        const img = card.querySelector('.food-card-image img');
        if (img) {
          if (img.naturalWidth > 0) {
            loaded.push({ name, src: img.src, width: img.naturalWidth, height: img.naturalHeight });
          } else {
            failed.push({ name, src: img.src });
          }
        }
      });
      return { totalCards: cards.length, loadedCount: loaded.length, failedCount: failed.length, sampleLoaded: loaded.slice(0, 5), failed };
    })()`,
    returnByValue: true
  });
  console.log('Menu Cards Result:', cardCheck.result.value);

  // Check 2: Item Nutrition Modal
  console.log('\n--- Checking Item Detail Modal ---');
  await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      const jowarCard = Array.from(document.querySelectorAll('.food-card')).find(c => c.textContent.includes('Jowar Roti'));
      if (jowarCard) jowarCard.click();
    })()`
  });
  await sleep(600);

  const modalCheck = await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      const modalImg = document.querySelector('#modalItemImage img');
      return {
        modalOpened: !document.getElementById('itemModal').classList.contains('hidden'),
        imgSrc: modalImg ? modalImg.src : null,
        naturalWidth: modalImg ? modalImg.naturalWidth : 0,
        naturalHeight: modalImg ? modalImg.naturalHeight : 0,
        complete: modalImg ? modalImg.complete : false
      };
    })()`,
    returnByValue: true
  });
  console.log('Item Modal Result:', modalCheck.result.value);

  // Check 3: Compare view
  console.log('\n--- Checking Compare Table View ---');
  const compareCheck = await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      Modal.close('itemModal');
      const checkboxes = document.querySelectorAll('.compare-card-cb');
      if (checkboxes[0]) { checkboxes[0].checked = true; checkboxes[0].dispatchEvent(new Event('change')); }
      if (checkboxes[1]) { checkboxes[1].checked = true; checkboxes[1].dispatchEvent(new Event('change')); }
      openCompareModal();
      const tableImgs = Array.from(document.querySelectorAll('.compare-col-img img')).map(img => ({
        src: img.src,
        naturalWidth: img.naturalWidth
      }));
      return { compareModalOpen: !document.getElementById('compareModal').classList.contains('hidden'), tableImgs };
    })()`,
    returnByValue: true
  });
  console.log('Compare View Result:', compareCheck.result.value);

  // Check 4: Cart page
  console.log('\n--- Checking Cart Page Image Display ---');
  await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      const jowar = allItems.find(i => i.name === 'Jowar Roti with Sabzi');
      if (jowar) Cart.add(jowar, 2);
    })()`
  });
  await pageCDP.send('Page.navigate', { url: 'http://localhost:3000/pages/cart.html' });
  await sleep(1000);

  const cartCheck = await pageCDP.send('Runtime.evaluate', {
    expression: `(() => {
      const imgs = Array.from(document.querySelectorAll('.cart-item-img img')).map(img => ({
        src: img.src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete
      }));
      return { cartItemsCount: imgs.length, imgs };
    })()`,
    returnByValue: true
  });
  console.log('Cart Page Result:', cartCheck.result.value);

  browserCDP.close();
  pageCDP.close();
  chromeProc.kill();
  console.log('\n✅ Image display verification complete!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
