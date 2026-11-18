const fs = require('fs');

const seedContent = fs.readFileSync('server/seed.js', 'utf8');
const items = [];
const itemRegex = /name:\s*['"]([^'"]+)['"][\s\S]*?category:\s*['"]([^'"]+)['"][\s\S]*?image:\s*['"]([^'"]+)['"][\s\S]*?description:\s*['"]([^'"]+)['"]/g;
let match;
while ((match = itemRegex.exec(seedContent)) !== null) {
  items.push({ name: match[1], category: match[2], image: match[3], desc: match[4] });
}

let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Food Image Audit Gallery</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #fff; padding: 2rem; }
    h1 { margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; }
    .card img { width: 100%; height: 180px; object-fit: cover; background: #334155; }
    .info { padding: 1rem; }
    .cat { font-size: 0.75rem; text-transform: uppercase; color: #f97316; font-weight: 700; margin-bottom: 0.25rem; }
    .title { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; }
    .desc { font-size: 0.8rem; color: #94a3b8; line-height: 1.4; margin-bottom: 0.5rem; }
    .url { font-size: 0.7rem; color: #64748b; word-break: break-all; }
  </style>
</head>
<body>
  <h1>CafeOrder — 40 Menu Items Audit Gallery</h1>
  <div class="grid">
`;

items.forEach((it, idx) => {
  html += `
    <div class="card">
      <img src="${it.image}" alt="${it.name}" loading="lazy" />
      <div class="info">
        <div class="cat">#${idx + 1} • ${it.category}</div>
        <div class="title">${it.name}</div>
        <div class="desc">${it.desc}</div>
        <div class="url">${it.image}</div>
      </div>
    </div>
  `;
});

html += `</div></body></html>`;

fs.writeFileSync('client/gallery.html', html);
console.log('✅ Generated client/gallery.html with all 40 items');
