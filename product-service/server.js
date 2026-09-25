/**
 * Product Microservice - CampusConnect (Web Services & SOA Lab 7)
 * Responsibility: Manage course catalog, textbooks, and lab kits.
 * Port: 3002
 */

try { require('dotenv').config(); } catch (e) {}

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.PRODUCT_SERVICE_PORT || process.env.PORT || 3002, 10);

// In-Memory catalog (Database-per-service pattern)
let products = [
  { id: 101, name: "Cloud & Web Services Certification", category: "Course",          price: 199.99, stock: 45, description: "Comprehensive hands-on curriculum in REST APIs, Docker, and Microservices.", createdAt: new Date().toISOString() },
  { id: 102, name: "Distributed Computing & SOA Guide",  category: "Textbook",         price: 49.50,  stock: 80, description: "Essential reference guide for building scalable enterprise service architectures.", createdAt: new Date().toISOString() },
  { id: 103, name: "IoT Sensor Kit - Advanced",          category: "Hardware Lab Kit", price: 120.00, stock: 25, description: "Microcontroller sensors and networking boards for laboratory experiments.", createdAt: new Date().toISOString() }
];

function getNextId() { return products.reduce((m, p) => Math.max(m, p.id), 100) + 1; }

function validateProduct(data, partial = false) {
  const e = [];
  if (!partial || data.name !== undefined)
    if (!data.name || !data.name.trim()) e.push('name is required');
  if (!partial || data.category !== undefined)
    if (!data.category || !data.category.trim()) e.push('category is required');
  if (!partial || data.price !== undefined)
    if (data.price === undefined || typeof data.price !== 'number' || data.price < 0) e.push('price must be a non-negative number');
  if (data.stock !== undefined)
    if (typeof data.stock !== 'number' || !Number.isInteger(data.stock) || data.stock < 0) e.push('stock must be a non-negative integer');
  return e;
}

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

const server = http.createServer(async (req, res) => {
  const p = url.parse(req.url).pathname;
  const m = req.method;

  if (m === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Accept' }); return res.end(); }

  console.log(`[Product Service] ${m} ${p}`);

  if (p === '/health' && m === 'GET')
    return sendJSON(res, 200, { status: 'healthy', service: 'product-service', port: PORT, timestamp: new Date().toISOString() });

  if (p === '/products' && m === 'GET')
    return sendJSON(res, 200, products);

  if (p === '/products' && m === 'POST') {
    try {
      const body = await readBody(req);
      const errs = validateProduct(body);
      if (errs.length) return sendJSON(res, 400, { errors: errs });
      const prod = { id: getNextId(), name: body.name.trim(), category: body.category.trim(), price: body.price, stock: body.stock !== undefined ? body.stock : 100, description: body.description ? body.description.trim() : '', createdAt: new Date().toISOString() };
      products.push(prod);
      return sendJSON(res, 201, prod);
    } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON payload' }); }
  }

  const match = p.match(/^\/products\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const idx = products.findIndex(p => p.id === id);
    if (m === 'GET') {
      if (idx === -1) return sendJSON(res, 404, { error: `Product with ID ${id} not found`, service: 'product-service' });
      return sendJSON(res, 200, products[idx]);
    }
    if (m === 'PUT') {
      if (idx === -1) return sendJSON(res, 404, { error: `Product with ID ${id} not found` });
      try {
        const body = await readBody(req);
        const errs = validateProduct(body, true);
        if (errs.length) return sendJSON(res, 400, { errors: errs });
        const prod = products[idx];
        if (body.name        !== undefined) prod.name        = body.name.trim();
        if (body.category    !== undefined) prod.category    = body.category.trim();
        if (body.price       !== undefined) prod.price       = body.price;
        if (body.stock       !== undefined) prod.stock       = body.stock;
        if (body.description !== undefined) prod.description = body.description.trim();
        return sendJSON(res, 200, prod);
      } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON payload' }); }
    }
    if (m === 'DELETE') {
      if (idx === -1) return sendJSON(res, 404, { error: `Product with ID ${id} not found` });
      const [deleted] = products.splice(idx, 1);
      return sendJSON(res, 200, { message: `Product ${id} deleted successfully`, deletedProduct: deleted });
    }
  }

  sendJSON(res, 404, { error: 'Endpoint not found', path: p, method: m });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(` [Product Service] running on port ${PORT}`);
  console.log(' Endpoints: GET/POST /products, GET/PUT/DELETE /products/:id, GET /health');
  console.log('========================================');
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
