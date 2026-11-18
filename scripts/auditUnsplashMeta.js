const https = require('https');
const fs = require('fs');

const seedContent = fs.readFileSync('server/seed.js', 'utf8');
const items = [];
const itemRegex = /name:\s*['"]([^'"]+)['"][\s\S]*?category:\s*['"]([^'"]+)['"][\s\S]*?image:\s*['"]([^'"]+)['"]/g;
let match;
while ((match = itemRegex.exec(seedContent)) !== null) {
  items.push({ name: match[1], category: match[2], image: match[3] });
}

function fetchPageTitle(photoId) {
  return new Promise((resolve) => {
    const url = `https://unsplash.com/photos/${photoId}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const titleMatch = data.match(/<title>([^<]+)<\/title>/);
        const metaDescMatch = data.match(/<meta\s+name="description"\s+content="([^"]+)"/);
        resolve({
          title: titleMatch ? titleMatch[1].replace(' | Unsplash', '').trim() : 'N/A',
          desc: metaDescMatch ? metaDescMatch[1].trim() : 'N/A'
        });
      });
    }).on('error', () => resolve({ title: 'Error', desc: 'Error' }));
  });
}

async function audit() {
  console.log('Auditing photos on Unsplash...\n');
  const uniqueIds = new Set();
  items.forEach(it => {
    const m = it.image.match(/photo-([a-zA-Z0-9-]+)/);
    if (m) uniqueIds.add(m[1]);
  });

  const metadata = new Map();
  for (const id of uniqueIds) {
    process.stdout.write(`Fetching metadata for photo-${id}... `);
    const meta = await fetchPageTitle(id);
    metadata.set(id, meta);
    console.log(`-> "${meta.title}"`);
    // brief pause
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n=== AUDIT RESULTS BY ITEM ===\n');
  for (const it of items) {
    const m = it.image.match(/photo-([a-zA-Z0-9-]+)/);
    const id = m ? m[1] : '';
    const meta = metadata.get(id) || { title: 'Unknown', desc: '' };
    console.log(`Dish: "${it.name}" [${it.category}]`);
    console.log(`  Current Image ID: photo-${id}`);
    console.log(`  Unsplash Title:   "${meta.title}"`);
    console.log(`  Unsplash Desc:    "${meta.desc.slice(0, 100)}..."`);
    console.log('');
  }
}

audit();
