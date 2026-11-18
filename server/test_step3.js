/**
 * Test Step 3 features:
 * 1. User DOB requirement, age validation (3-100, not future), computed ageGroup (child, teen, adult, senior)
 * 2. Profile update (PUT /api/auth/me) with DOB & allergies
 * 3. Personalised recommendations by ageGroup (skipping user's declared allergies, returning reason strings)
 * 4. Order creation returning allergyConflicts when matching user's allergies
 * 5. Menu & Compare data availability
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runTests() {
  console.log('\n🧪 Starting Step 3 Verification Tests...\n');

  // ── 1. Registration Validation for DOB ────────────────────────
  console.log('--- Test 1: Registration Date of Birth Validation ---');

  // 1a. Missing DOB
  const missingDobRes = await request('POST', '/auth/register', {
    name: 'Test No DOB',
    email: `nodob_${Date.now()}@example.com`,
    password: 'Password123'
  });
  assert(missingDobRes.status === 400, 'Registration rejects missing dateOfBirth');

  // 1b. Future DOB
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const futureDobRes = await request('POST', '/auth/register', {
    name: 'Test Future DOB',
    email: `future_${Date.now()}@example.com`,
    password: 'Password123',
    dateOfBirth: futureDate.toISOString().split('T')[0]
  });
  assert(futureDobRes.status === 400, 'Registration rejects future dateOfBirth');

  // 1c. Age < 3 years
  const toddlerDate = new Date();
  toddlerDate.setFullYear(toddlerDate.getFullYear() - 1);
  const toddlerRes = await request('POST', '/auth/register', {
    name: 'Test Toddler',
    email: `toddler_${Date.now()}@example.com`,
    password: 'Password123',
    dateOfBirth: toddlerDate.toISOString().split('T')[0]
  });
  assert(toddlerRes.status === 400, 'Registration rejects age < 3 years');

  // 1d. Age > 100 years
  const ancientDate = new Date();
  ancientDate.setFullYear(ancientDate.getFullYear() - 105);
  const ancientRes = await request('POST', '/auth/register', {
    name: 'Test Ancient',
    email: `ancient_${Date.now()}@example.com`,
    password: 'Password123',
    dateOfBirth: ancientDate.toISOString().split('T')[0]
  });
  assert(ancientRes.status === 400, 'Registration rejects age > 100 years');

  // 1e. Valid Registration for Child (Age 8)
  const childDob = new Date();
  childDob.setFullYear(childDob.getFullYear() - 8);
  const childRegRes = await request('POST', '/auth/register', {
    name: 'Child User',
    email: `child_${Date.now()}@example.com`,
    password: 'Password123',
    dateOfBirth: childDob.toISOString().split('T')[0],
    allergies: ['peanuts']
  });
  assert(childRegRes.status === 201, 'Child user registers successfully');
  assert(childRegRes.body.user.ageGroup === 'child', `Computed ageGroup is child (got: ${childRegRes.body.user.ageGroup})`);
  const childToken = childRegRes.body.token;

  // 1f. Valid Registration for Senior (Age 68) with Dairy allergy
  const seniorDob = new Date();
  seniorDob.setFullYear(seniorDob.getFullYear() - 68);
  const seniorRegRes = await request('POST', '/auth/register', {
    name: 'Senior User',
    email: `senior_${Date.now()}@example.com`,
    password: 'Password123',
    dateOfBirth: seniorDob.toISOString().split('T')[0],
    allergies: ['dairy']
  });
  assert(seniorRegRes.status === 201, 'Senior user registers successfully');
  assert(seniorRegRes.body.user.ageGroup === 'senior', `Computed ageGroup is senior (got: ${seniorRegRes.body.user.ageGroup})`);
  const seniorToken = seniorRegRes.body.token;

  // ── 2. Profile Update (PUT /api/auth/me) ──────────────────────
  console.log('\n--- Test 2: Profile & Allergies Update ---');

  // 2a. Reject invalid allergen
  const badAllergenRes = await request('PUT', '/auth/me', {
    allergies: ['ketchup', 'dairy']
  }, seniorToken);
  assert(badAllergenRes.status === 400, 'Rejects invalid allergen not in ALLERGENS list');

  // 2b. Update DOB and allergies
  const teenDob = new Date();
  teenDob.setFullYear(teenDob.getFullYear() - 16);
  const updateProfileRes = await request('PUT', '/auth/me', {
    name: 'Senior Updated to Teen',
    dateOfBirth: teenDob.toISOString().split('T')[0],
    allergies: ['dairy', 'nuts']
  }, seniorToken);

  assert(updateProfileRes.status === 200, 'Profile updated successfully');
  assert(updateProfileRes.body.user.ageGroup === 'teen', `Age group recomputed to teen (got: ${updateProfileRes.body.user.ageGroup})`);
  assert(updateProfileRes.body.user.allergies.includes('dairy') && updateProfileRes.body.user.allergies.includes('nuts'), 'Allergies array correctly saved');

  // Re-switch to senior with dairy allergy for next tests
  await request('PUT', '/auth/me', {
    dateOfBirth: seniorDob.toISOString().split('T')[0],
    allergies: ['dairy']
  }, seniorToken);

  // ── 3. Recommendations Endpoint ──────────────────────────────
  console.log('\n--- Test 3: Personalised Recommendations ---');

  // 3a. Child recommendations
  const childRecsRes = await request('GET', '/menu/recommendations', null, childToken);
  assert(childRecsRes.status === 200, 'Child recommendations returned 200');
  assert(Array.isArray(childRecsRes.body.recommendations), 'Returns recommendations array');
  assert(childRecsRes.body.recommendations.length > 0 && childRecsRes.body.recommendations.length <= 8, `Child received ${childRecsRes.body.recommendations.length} recommendations (max 8)`);
  assert(childRecsRes.body.ageGroup === 'child', 'Returned ageGroup is child');
  assert(childRecsRes.body.recommendations.every(r => r.reason && typeof r.reason === 'string'), 'Every recommendation has a reason string');
  assert(childRecsRes.body.recommendations.every(r => !(r.allergens || []).includes('peanuts')), 'No child recommendations contain peanut allergen');

  // 3b. Senior recommendations
  const seniorRecsRes = await request('GET', '/menu/recommendations', null, seniorToken);
  assert(seniorRecsRes.status === 200, 'Senior recommendations returned 200');
  assert(seniorRecsRes.body.ageGroup === 'senior', 'Returned ageGroup is senior');
  assert(seniorRecsRes.body.recommendations.every(r => !(r.allergens || []).includes('dairy')), 'Senior recommendations strictly exclude items with dairy');

  console.log(`Child top recommendation: "${childRecsRes.body.recommendations[0].name}" — Reason: ${childRecsRes.body.recommendations[0].reason}`);
  console.log(`Senior top recommendation: "${seniorRecsRes.body.recommendations[0].name}" — Reason: ${seniorRecsRes.body.recommendations[0].reason}`);

  // ── 4. Order Creation & Allergy Conflicts Detection ──────────
  console.log('\n--- Test 4: Allergy Conflict Advisory in Order Response ---');

  // Find a menu item with dairy (e.g. Masala Chai or Paneer dish)
  const menuRes = await request('GET', '/menu');
  const items = menuRes.body.items || [];
  const dairyItem = items.find(i => Array.isArray(i.allergens) && i.allergens.includes('dairy'));
  assert(dairyItem, `Found dairy-containing item for testing: ${dairyItem?.name}`);

  const orderRes = await request('POST', '/orders', {
    customerName: 'Senior User',
    customerPhone: '9876543210',
    orderType: 'pickup',
    items: [{ menuItem: dairyItem._id, quantity: 1 }]
  }, seniorToken);

  assert(orderRes.status === 201, 'Order created successfully even with allergy conflict (advisory only)');
  assert(Array.isArray(orderRes.body.allergyConflicts), 'Order response contains allergyConflicts array');
  assert(orderRes.body.allergyConflicts.length === 1, `1 allergy conflict detected: ${orderRes.body.allergyConflicts[0].name}`);
  assert(orderRes.body.allergyConflicts[0].conflictingAllergens.includes('dairy'), 'Conflict identifies dairy as conflicting allergen');

  // ── 5. Preserved Features Check ──────────────────────────────
  console.log('\n--- Test 5: Existing Features Preserved ---');

  // Check login
  const loginRes = await request('POST', '/auth/login', {
    email: 'customer@example.com',
    password: 'Customer@123'
  });
  assert(loginRes.status === 200, 'Existing seeded customer login succeeds');

  // Check rewards preview
  const prevRes = await request('POST', '/rewards/preview', {
    items: [{ menuItem: dairyItem._id, quantity: 2 }]
  }, loginRes.body.token);
  assert(prevRes.status === 200, 'Rewards preview endpoint operates smoothly');

  console.log('\n🎉 ALL STEP 3 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});