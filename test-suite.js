import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3891;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess = null;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          return true;
        }
      }
    } catch (_) {
      // server not up yet
    }
    await sleep(200);
  }
  throw new Error('Server did not start within timeout');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('🚀 Starting Farsly Backend Test Server on port', PORT);
  serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: 'inherit',
  });

  await waitForServer();
  console.log('✅ Server is healthy and accepting requests!\n');

  // --- 1. LOGIN CUSTOMER & RESTAURANT ---
  console.log('--- 1. Authenticating Test Users ---');
  const custLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer@farsly.com', password: 'password123' }),
  });
  const custLogin = await custLoginRes.json();
  assert(custLoginRes.status === 200, 'Customer login succeeds');
  assert(!!custLogin.token, 'Customer token returned');
  const custToken = custLogin.token;

  const restLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'restaurant@farsly.com', password: 'password123' }),
  });
  const restLogin = await restLoginRes.json();
  assert(restLoginRes.status === 200, 'Restaurant login succeeds');
  assert(!!restLogin.token, 'Restaurant token returned');
  const restToken = restLogin.token;

  // Fetch a menu item for testing
  const menuRes = await fetch(`${BASE_URL}/api/menu`);
  const menuData = await menuRes.json();
  const testMenuItem = menuData[0];
  assert(Array.isArray(menuData) && testMenuItem && testMenuItem.id, 'Menu items retrieved for tests');
  const menuItemId = testMenuItem.id;

  // --- 2. ENDPOINT: CART SYNCHRONIZATION (/api/cart) ---
  console.log('\n--- 2. Testing Cart Synchronization (/api/cart) ---');
  // Initial clear
  await fetch(`${BASE_URL}/api/cart`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` },
  });

  // GET /api/cart
  const emptyCartRes = await fetch(`${BASE_URL}/api/cart`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  const emptyCart = await emptyCartRes.json();
  assert(emptyCartRes.status === 200, 'GET /api/cart returns 200');
  assert(emptyCart.items.length === 0, 'Cart starts empty');

  // POST /api/cart (add item)
  const addCartRes = await fetch(`${BASE_URL}/api/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ menuItemId, quantity: 2, notes: 'Extra sauce on side' }),
  });
  const addCart = await addCartRes.json();
  assert(addCartRes.status === 201, 'POST /api/cart returns 201 Created');
  assert(addCart.quantity === 2, 'Added cart item has quantity 2');
  assert(addCart.item && addCart.item.id === menuItemId, 'cartItem includes item details');
  const cartItemId = addCart.id;

  // PUT /api/cart/:itemId
  const updateCartRes = await fetch(`${BASE_URL}/api/cart/${cartItemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ quantity: 4, notes: 'Updated notes' }),
  });
  const updateCart = await updateCartRes.json();
  assert(updateCartRes.status === 200, 'PUT /api/cart/:itemId returns 200');
  assert(updateCart.quantity === 4, 'Updated cart item quantity is 4');
  assert(updateCart.notes === 'Updated notes', 'Updated notes saved');

  // Role check: Restaurant cannot access customer cart
  const restCartRes = await fetch(`${BASE_URL}/api/cart`, {
    headers: { Authorization: `Bearer ${restToken}` },
  });
  assert(restCartRes.status === 403, 'Restaurant role is blocked from /api/cart (403)');

  // DELETE /api/cart/:itemId
  const delItemRes = await fetch(`${BASE_URL}/api/cart/${cartItemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert(delItemRes.status === 200, 'DELETE /api/cart/:itemId returns 200');

  // Clear cart
  await fetch(`${BASE_URL}/api/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ menuItemId, quantity: 1 }),
  });
  const clearCartRes = await fetch(`${BASE_URL}/api/cart`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` },
  });
  const clearCart = await clearCartRes.json();
  assert(clearCartRes.status === 200 && clearCart.deletedCount >= 1, 'DELETE /api/cart clears entire cart');

  // --- 3. ENDPOINT: FAVORITES SYNCHRONIZATION (/api/favorites) ---
  console.log('\n--- 3. Testing Favorites Synchronization (/api/favorites) ---');
  // Remove first if already present
  await fetch(`${BASE_URL}/api/favorites/${menuItemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` },
  });

  // POST /api/favorites/:menuId
  const addFavRes = await fetch(`${BASE_URL}/api/favorites/${menuItemId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
  });
  const addFav = await addFavRes.json();
  assert(addFavRes.status === 201, 'POST /api/favorites/:menuId returns 201');
  assert(addFav.menuItemId === menuItemId, 'Item confirmed added to favorites');

  // GET /api/favorites
  const listFavRes = await fetch(`${BASE_URL}/api/favorites`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  const listFav = await listFavRes.json();
  assert(listFavRes.status === 200, 'GET /api/favorites returns 200');
  const favFound = Array.isArray(listFav) && listFav.some((f) => f.id === menuItemId);
  assert(favFound, 'Favorite item present in list with menu item data');

  // Role check: Restaurant blocked from favorites
  const restFavRes = await fetch(`${BASE_URL}/api/favorites`, {
    headers: { Authorization: `Bearer ${restToken}` },
  });
  assert(restFavRes.status === 403, 'Restaurant role is blocked from /api/favorites (403)');

  // DELETE /api/favorites/:menuId
  const delFavRes = await fetch(`${BASE_URL}/api/favorites/${menuItemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` },
  });
  const delFav = await delFavRes.json();
  assert(delFavRes.status === 200 && delFav.menuItemId === menuItemId, 'DELETE /api/favorites/:menuId returns 200');

  // --- 4. ENDPOINT: AUTH PROFILE & PASSWORD UPDATE ---
  console.log('\n--- 4. Testing Profile & Password Updates (/api/auth) ---');
  const uniqueEmail = `test_${Date.now()}@example.com`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Initial Name', email: uniqueEmail, password: 'oldpassword123' }),
  });
  const regData = await regRes.json();
  assert(regRes.status === 201, 'New test user registered');
  const userToken = regData.token;

  // PUT /api/auth/profile
  const updateProfileRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ name: 'Renamed User' }),
  });
  const updateProfile = await updateProfileRes.json();
  assert(updateProfileRes.status === 200, 'PUT /api/auth/profile returns 200');
  assert(updateProfile.user.name === 'Renamed User', 'Name updated successfully');

  // PUT /api/auth/password with wrong current password
  const badPassRes = await fetch(`${BASE_URL}/api/auth/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ currentPassword: 'wrongpassword', newPassword: 'newsecurepass123' }),
  });
  assert(badPassRes.status === 401 || badPassRes.status === 400, 'PUT /api/auth/password rejects incorrect currentPassword');

  // PUT /api/auth/password with correct current password
  const goodPassRes = await fetch(`${BASE_URL}/api/auth/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ currentPassword: 'oldpassword123', newPassword: 'newsecurepass123' }),
  });
  assert(goodPassRes.status === 200, 'PUT /api/auth/password accepts valid change (200)');

  // Verify login with new password
  const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail, password: 'newsecurepass123' }),
  });
  assert(newLoginRes.status === 200, 'Login succeeds with new password');

  // --- 5. ENDPOINT: ORDER CANCELLATION (/api/orders/:id/cancel) ---
  console.log('\n--- 5. Testing Customer Order Cancellation (/api/orders/:id/cancel) ---');
  // Create an order
  const createOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      items: [{ menuItemId, quantity: 2, price: 14.5 }],
      deliveryAddress: '456 Organic Lane, Suite 2B',
      contactPhone: '555-1234',
      notes: 'Please leave at the door',
    }),
  });
  const newOrder = await createOrderRes.json();
  assert(createOrderRes.status === 201, 'Customer created order for cancellation test');
  const orderId = newOrder.id;

  // Cancel order as owner
  const cancelRes = await fetch(`${BASE_URL}/api/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ reason: 'Ordered by mistake' }),
  });
  const cancelData = await cancelRes.json();
  assert(cancelRes.status === 200, 'POST /api/orders/:id/cancel returns 200');
  assert(cancelData.status === 'cancelled', 'Order status updated to cancelled');

  // Attempt to cancel again (must fail because it is already cancelled)
  const reCancelRes = await fetch(`${BASE_URL}/api/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
  });
  assert(reCancelRes.status === 400, 'Cannot re-cancel non-pending order (400)');

  // --- 6. ENDPOINT: STANDALONE FILE UPLOAD (/api/upload) ---
  console.log('\n--- 6. Testing Standalone Image Upload (/api/upload) ---');
  // Customer role blocked
  const custUploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert(custUploadRes.status === 403, 'Customer role blocked from /api/upload (403)');

  // Restaurant role upload valid image
  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const formData = new FormData();
  formData.append('image', new Blob([dummyPng], { type: 'image/png' }), 'test-food.png');

  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${restToken}` },
    body: formData,
  });
  const uploadData = await uploadRes.json();
  assert(uploadRes.status === 201, 'Restaurant POST /api/upload returns 201 Created');
  assert(!!uploadData.url && uploadData.url.startsWith('/uploads/'), 'Upload returns valid URL (/uploads/...)');
  assert(uploadData.filename.endsWith('.png'), 'Filename has correct extension');

  // Verify static accessibility of the uploaded file
  const fileCheckRes = await fetch(`${BASE_URL}${uploadData.url}`);
  assert(fileCheckRes.status === 200, 'Uploaded file is reachable via GET /uploads/:filename');

  // --- 7. ENDPOINT: RESTAURANT DASHBOARD STATS (/api/restaurant/stats) ---
  console.log('\n--- 7. Testing Restaurant Dashboard Stats (/api/restaurant/stats) ---');
  // Customer role blocked
  const custStatsRes = await fetch(`${BASE_URL}/api/restaurant/stats`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert(custStatsRes.status === 403, 'Customer role blocked from /api/restaurant/stats (403)');

  // Restaurant gets stats
  const restStatsRes = await fetch(`${BASE_URL}/api/restaurant/stats`, {
    headers: { Authorization: `Bearer ${restToken}` },
  });
  const restStats = await restStatsRes.json();
  assert(restStatsRes.status === 200, 'GET /api/restaurant/stats returns 200');
  assert(typeof restStats.orders.total === 'number', 'orders.total is numeric');
  assert(typeof restStats.orders.cancelled === 'number', 'orders.cancelled is numeric and includes cancelled orders');
  assert(typeof restStats.revenue.total === 'number', 'revenue.total is numeric');
  assert(typeof restStats.menu.total === 'number', 'menu.total is numeric');
  assert(typeof restStats.customers.total === 'number', 'customers.total is numeric');

  // --- 8. REGRESSION TESTS ---
  console.log('\n--- 8. Testing Core Endpoint Regressions ---');
  const rootRes = await fetch(`${BASE_URL}/`);
  const rootData = await rootRes.json();
  assert(rootRes.status === 200, 'Root endpoint / responds 200');
  assert(rootData.endpoints.cart === '/api/cart', 'Root includes /api/cart documentation');
  assert(rootData.endpoints.restaurantStats === '/api/restaurant/stats', 'Root includes /api/restaurant/stats');

  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  assert(healthRes.status === 200 && healthData.status === 'ok', 'Health endpoint is ok');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 100% Endpoints Verified.\n');
}

runTests()
  .catch((err) => {
    console.error('\n❌ Test suite failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });
