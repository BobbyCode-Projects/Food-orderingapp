const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '../client/images');
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

const imagesToDownload = [
  {
    name: 'paneer-butter-masala.jpg',
    dish: 'Paneer Butter Masala + Roti',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Paneer_butter_masala_2.jpg'
  },
  {
    name: 'jowar-roti-sabzi.jpg',
    dish: 'Jowar Roti with Sabzi',
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Roti_sabzi.jpg'
  },
  {
    name: 'foxtail-millet-pongal.jpg',
    dish: 'Foxtail Millet Pongal',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/17/Ven_Pongal_with_cashew.jpg'
  },
  {
    name: 'millet-upma.jpg',
    dish: 'Millet Upma',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Rava_Upma.jpg'
  },
  {
    name: 'ragi-dosa.jpg',
    dish: 'Ragi Dosa',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c4/Ragi_Dosa_Mumbai.jpg'
  },
  {
    name: 'vegetable-idli.jpg',
    dish: 'Vegetable Idli with Sambar',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/17/Vegetable_Idli_-_Version_of_Idli.JPG'
  },
  {
    name: 'moong-dal-chilla.jpg',
    dish: 'Moong Dal Chilla',
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/Pesarattu.jpg'
  },
  {
    name: 'bajra-khichdi.jpg',
    dish: 'Bajra Khichdi',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/10/Masala_Khichadi.jpg'
  },
  {
    name: 'traditional-veg-thali.jpg',
    dish: 'Traditional Veg Thali',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Vegetarian_Thali_4.jpg'
  },
  {
    name: 'fruit-nuts-bowl.jpg',
    dish: 'Fruit and Nuts Bowl',
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Fruit_Salad_Or_Fruit_Bowl.jpg'
  }
];

function downloadFile(urlStr, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(urlStr, {
      headers: {
        'User-Agent': 'CafeOrderImageDownloader/1.0 (https://github.com/example/cafeorder; dev@cafeorder.com)'
      }
    }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirect = res.headers.location;
        if (!redirect.startsWith('http')) {
          redirect = new URL(redirect, urlStr).toString();
        }
        res.resume();
        return downloadFile(redirect, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(fs.statSync(destPath).size);
      });
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
  });
}

async function main() {
  console.log('⬇️ Downloading authentic food images to client/images/...\n');
  for (const item of imagesToDownload) {
    const dest = path.join(TARGET_DIR, item.name);
    process.stdout.write(`Downloading "${item.dish}" -> ${item.name}... `);
    try {
      const bytes = await downloadFile(item.url, dest);
      console.log(`✅ OK (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }

  console.log('\nVerifying downloaded files:');
  const files = fs.readdirSync(TARGET_DIR);
  files.forEach(f => {
    const s = fs.statSync(path.join(TARGET_DIR, f));
    console.log(`  - client/images/${f} (${(s.size / 1024).toFixed(1)} KB)`);
  });
}

main();
