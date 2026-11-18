const http = require('http');
const { menuItems } = require('../server/seed');

function postJson(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function putJson(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'PUT',
      headers
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🔑 Logging in as admin...');
  const loginRes = await postJson('http://localhost:3000/api/auth/login', {
    email: 'admin@cafeteria.com',
    password: 'Admin@123'
  });

  if (loginRes.status !== 200 || !loginRes.data?.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes));
  }
  const token = loginRes.data.token;
  console.log('✅ Admin authenticated\n');

  console.log('📡 Fetching live menu items...');
  const menuData = await getJson('http://localhost:3000/api/menu');
  const liveItems = menuData.items || [];
  console.log(`Found ${liveItems.length} live items in database\n`);

  let updatedCount = 0;
  for (const seedItem of menuItems) {
    const live = liveItems.find(i => i.name === seedItem.name);
    if (!live) {
      console.log(`⚠️ Item not found in live DB: ${seedItem.name}`);
      continue;
    }

    if (live.image !== seedItem.image) {
      console.log(`🔄 Updating "${seedItem.name}":`);
      console.log(`   Old: ${live.image}`);
      console.log(`   New: ${seedItem.image}`);

      const updatePayload = {
        ...live,
        ...seedItem,
        image: seedItem.image
      };

      const putRes = await putJson(`http://localhost:3000/api/menu/${live._id}`, updatePayload, token);
      if (putRes.status === 200) {
        console.log(`   ✅ Successfully updated!`);
        updatedCount++;
      } else {
        console.log(`   ❌ Failed to update: ${JSON.stringify(putRes)}`);
      }
    } else {
      console.log(`✓ Image already up to date for: "${seedItem.name}" -> ${live.image}`);
    }
  }

  console.log(`\n🎉 Updated ${updatedCount} live database items with corrected images!`);
}

main().catch(err => {
  console.error('Update error:', err);
  process.exit(1);
});
