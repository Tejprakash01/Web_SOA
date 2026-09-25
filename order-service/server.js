/**
 * Order Microservice - CampusConnect (Web Services & SOA Lab 7)
 * Responsibility: Coordinate order placement with inter-service validation.
 * Port: 3003
 *
 * Inter-Service Calls:
 *   POST /orders -> GET {USER_SERVICE_URL}/users/:id
 *   POST /orders -> GET {PRODUCT_SERVICE_URL}/products/:id
 *
 * Fault Tolerance:
 *   - 404 if referenced user or product not found
 *   - 503 if dependency service is unreachable/times out
 */

try { require('dotenv').config(); } catch (e) {}

const http = require('http');
const url = require('url');

function normalizeUrl(rawUrl, defaultUrl) {
  let u = (rawUrl || defaultUrl).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  if (!u.includes('.') && !u.includes('localhost') && !u.includes('127.0.0.1')) {
    u = u + '.onrender.com';
  }
  return u;
}

const PORT               = parseInt(process.env.ORDER_SERVICE_PORT    || process.env.PORT || 3003, 10);
const USER_SERVICE_URL   = normalizeUrl(process.env.USER_SERVICE_URL, 'http://localhost:3001');
const PRODUCT_SERVICE_URL = normalizeUrl(process.env.PRODUCT_SERVICE_URL, 'http://localhost:3002');
const TIMEOUT_MS         = parseInt(process.env.INTER_SERVICE_TIMEOUT_MS || 3000, 10);

// In-Memory order store (Database-per-service)
let orders = [
  {
    id: 1001, userId: 1, productId: 101, quantity: 1, totalAmount: 199.99, status: 'CONFIRMED',
    userSnapshot:    { id: 1,   name: 'Aarav Patel',                      email: 'aarav.patel@campusconnect.edu',    department: 'Computer Science' },
    productSnapshot: { id: 101, name: 'Cloud & Web Services Certification', category: 'Course', unitPrice: 199.99 },
    notes: 'Initial seed order for verification',
    createdAt: new Date().toISOString()
  }
];

function getNextOrderId() { return orders.reduce((m, o) => Math.max(m, o.id), 1000) + 1; }

function sendJSON(res, code, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Inter-service HTTP call with timeout
async function callService(targetUrl) {
  try {
    const resp = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (resp.status === 404) return { ok: false, notFound: true };
    if (!resp.ok) return { ok: false, serviceError: true, status: resp.status };
    return { ok: true, data: await resp.json() };
  } catch (err) {
    console.error(`[Order Service] Dependency call failed (${targetUrl}): ${err.message}`);
    return { ok: false, unavailable: true, url: targetUrl, message: err.message };
  }
}

const server = http.createServer(async (req, res) => {
  const p = url.parse(req.url).pathname;
  const m = req.method;

  if (m === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Accept' }); return res.end(); }

  console.log(`[Order Service] ${m} ${p}`);

  if (p === '/health' && m === 'GET')
    return sendJSON(res, 200, { status: 'healthy', service: 'order-service', port: PORT, dependencies: { userServiceUrl: USER_SERVICE_URL, productServiceUrl: PRODUCT_SERVICE_URL, timeoutMs: TIMEOUT_MS }, timestamp: new Date().toISOString() });

  if (p === '/orders' && m === 'GET')
    return sendJSON(res, 200, orders);

  const orderMatch = p.match(/^\/orders\/(\d+)$/);
  if (orderMatch && m === 'GET') {
    const id = parseInt(orderMatch[1], 10);
    const o = orders.find(o => o.id === id);
    if (!o) return sendJSON(res, 404, { error: `Order with ID ${id} not found` });
    return sendJSON(res, 200, o);
  }

  if (p === '/orders' && m === 'POST') {
    try {
      const body = await readBody(req);
      const { userId, productId, quantity = 1, notes = '' } = body;

      if (typeof userId !== 'number')   return sendJSON(res, 400, { error: 'userId is required and must be a number' });
      if (typeof productId !== 'number') return sendJSON(res, 400, { error: 'productId is required and must be a number' });
      if (typeof quantity !== 'number' || quantity < 1) return sendJSON(res, 400, { error: 'quantity must be a positive integer' });

      // -- STEP 1: Call User Service --
      const userUrl = `${USER_SERVICE_URL}/users/${userId}`;
      console.log(`[Order Service -> User Service] GET ${userUrl}`);
      const userResult = await callService(userUrl);

      if (!userResult.ok) {
        if (userResult.unavailable) return sendJSON(res, 503, { error: 'Service Unavailable: Unable to communicate with User Service', targetService: 'user-service', targetUrl: userResult.url, details: userResult.message, suggestion: 'Verify that User Service is running and accessible on the network.' });
        if (userResult.notFound)    return sendJSON(res, 404, { error: `Referenced User with ID ${userId} does not exist`, targetService: 'user-service' });
        return sendJSON(res, 502, { error: 'User Service returned an unexpected error' });
      }

      // -- STEP 2: Call Product Service --
      const prodUrl = `${PRODUCT_SERVICE_URL}/products/${productId}`;
      console.log(`[Order Service -> Product Service] GET ${prodUrl}`);
      const prodResult = await callService(prodUrl);

      if (!prodResult.ok) {
        if (prodResult.unavailable) return sendJSON(res, 503, { error: 'Service Unavailable: Unable to communicate with Product Service', targetService: 'product-service', targetUrl: prodResult.url, details: prodResult.message, suggestion: 'Verify that Product Service is running and accessible on the network.' });
        if (prodResult.notFound)    return sendJSON(res, 404, { error: `Referenced Product with ID ${productId} does not exist`, targetService: 'product-service' });
        return sendJSON(res, 502, { error: 'Product Service returned an unexpected error' });
      }

      // -- STEP 3: Persist order in private store --
      const user    = userResult.data;
      const product = prodResult.data;
      const total   = parseFloat((product.price * quantity).toFixed(2));
      const newOrder = {
        id: getNextOrderId(), userId: user.id, productId: product.id, quantity, totalAmount: total, status: 'CONFIRMED',
        userSnapshot:    { id: user.id,    name: user.name,    email: user.email,    department: user.department },
        productSnapshot: { id: product.id, name: product.name, category: product.category, unitPrice: product.price },
        notes: notes.trim(),
        createdAt: new Date().toISOString()
      };
      orders.push(newOrder);
      console.log(`[Order Service] Order #${newOrder.id} confirmed for User #${userId} / Product #${productId}`);
      return sendJSON(res, 201, { message: 'Order created successfully after validating User and Product services', order: newOrder });

    } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON payload', details: e.message }); }
  }

  sendJSON(res, 404, { error: 'Endpoint not found', path: p, method: m });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(` [Order Service] running on port ${PORT}`);
  console.log(` User Service URL:    ${USER_SERVICE_URL}`);
  console.log(` Product Service URL: ${PRODUCT_SERVICE_URL}`);
  console.log(' Endpoints: GET/POST /orders, GET /orders/:id, GET /health');
  console.log('========================================');
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
