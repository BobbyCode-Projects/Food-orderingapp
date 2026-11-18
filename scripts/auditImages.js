const fs = require('fs');

// We can read menuItems directly or parse from seed.js
const seedContent = fs.readFileSync('server/seed.js', 'utf8');
const items = [];
const itemRegex = /name:\s*['"]([^'"]+)['"][\s\S]*?category:\s*['"]([^'"]+)['"][\s\S]*?image:\s*['"]([^'"]+)['"]/g;
let match;
while ((match = itemRegex.exec(seedContent)) !== null) {
  items.push({ name: match[1], category: match[2], image: match[3] });
}

console.log(`Audited ${items.length} items from seed.js\n`);

const urlMap = new Map();
items.forEach(it => {
  // Normalize unsplash photo id
  const idMatch = it.image.match(/photo-([a-zA-Z0-9-]+)/);
  const photoId = idMatch ? idMatch[1] : it.image;
  if (!urlMap.has(photoId)) urlMap.set(photoId, []);
  urlMap.get(photoId).push(it);
});

console.log('=== DUPLICATE IMAGE ANALYSIS ===');
let dupCount = 0;
for (const [id, itemList] of urlMap.entries()) {
  if (itemList.length > 1) {
    dupCount++;
    console.log(`\nPhoto ID / URL: ${id}`);
    itemList.forEach(it => console.log(`  - [${it.category}] "${it.name}"`));
  }
}
console.log(`\nTotal duplicate groups: ${dupCount}`);

console.log('\n=== COMPLETE 40-ITEM AUDIT TABLE ===');
items.forEach((it, idx) => {
  const idMatch = it.image.match(/photo-([a-zA-Z0-9-]+)/);
  const id = idMatch ? idMatch[1] : it.image;
  const isDup = urlMap.get(id).length > 1;
  console.log(`${(idx + 1).toString().padStart(2)}. [${it.category.padEnd(14)}] ${it.name.padEnd(30)} ${isDup ? '⚠️ DUPLICATE' : '✅ UNIQUE'} -> ${it.image}`);
});
