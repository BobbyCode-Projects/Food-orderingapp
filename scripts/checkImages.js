/**
 * scripts/checkImages.js
 * Checks all menu item images in seed.js / database.
 * Reports all broken URLs and exits with code 1 if any fail.
 */

const http = require('http');
const https = require('https');
const { menuItems } = require('../server/seed');

function checkUrl(urlStr, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!urlStr || typeof urlStr !== 'string') {
      return resolve({ ok: false, error: 'Empty URL' });
    }

    if (urlStr.startsWith('/')) {
      // Local image relative to client/
      const fs = require('fs');
      const path = require('path');
      const localPath = path.join(__dirname, '../client', urlStr);
      if (fs.existsSync(localPath)) {
        return resolve({ ok: true, status: 200, local: true });
      } else {
        return resolve({ ok: false, error: `Local file not found: ${localPath}` });
      }
    }

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return resolve({ ok: false, error: 'Invalid URL format' });
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: timeoutMs
    };

    const req = client.request(reqOptions, (res) => {
      // Follow redirect (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, urlStr).toString();
        }
        res.resume();
        return checkUrl(redirectUrl, timeoutMs).then(resolve);
      }

      const contentType = res.headers['content-type'] || '';
      const isOk = res.statusCode >= 200 && res.statusCode < 300;
      
      // Consume a small chunk and abort to save bandwidth
      res.destroy();

      if (isOk) {
        resolve({ ok: true, status: res.statusCode, contentType });
      } else {
        resolve({ ok: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout (> 8s)' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.end();
  });
}

async function getItemsToCheck() {
  // Try fetching from live server first
  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3000/api/menu', (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    });
    if (data && Array.isArray(data.items) && data.items.length > 0) {
      console.log(`📡 Loaded ${data.items.length} items from live API (http://localhost:3000/api/menu)`);
      return data.items;
    }
  } catch (_) {}

  // Fallback to seed.js definition
  console.log(`📦 Loaded ${menuItems.length} items from server/seed.js`);
  return menuItems || [];
}

async function main() {
  console.log('🔍 Checking food images for all menu items...\n');

  const items = await getItemsToCheck();
  const broken = [];
  const checkedCache = new Map();

  for (const item of items) {
    const url = item.image;
    let result;
    if (checkedCache.has(url)) {
      result = checkedCache.get(url);
    } else {
      result = await checkUrl(url);
      checkedCache.set(url, result);
    }

    if (!result.ok) {
      broken.push({
        name: item.name,
        category: item.category,
        image: url,
        reason: result.error || `HTTP ${result.status}`
      });
      console.log(`❌ ${item.name} (${item.category}): ${result.error} -> ${url}`);
    } else {
      console.log(`✅ ${item.name}: OK (${result.status || 'found'})`);
    }
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`Total items checked: ${items.length}`);
  console.log(`Working: ${items.length - broken.length}`);
  console.log(`Broken:  ${broken.length}`);

  if (broken.length > 0) {
    console.log('\nList of broken items:');
    broken.forEach((b, i) => {
      console.log(`${i + 1}. ${b.name} (${b.category}): ${b.reason}\n   URL: ${b.image}`);
    });
    console.log('────────────────────────────────────────────────────────\n');
    process.exit(1);
  } else {
    console.log('\n🎉 All food images are accessible and working!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});