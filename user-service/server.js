/**
 * User Microservice - CampusConnect (Web Services & SOA Lab 7)
 * Responsibility: Manage user/student profiles, roles, and departments.
 * Port: 3001
 */

try { require('dotenv').config(); } catch (e) {}

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.USER_SERVICE_PORT || process.env.PORT || 3001, 10);

// In-Memory store (Database-per-service pattern)
let users = [
  { id: 1, name: "Aarav Patel",     email: "aarav.patel@campusconnect.edu",   department: "Computer Science",      role: "student",  createdAt: new Date().toISOString() },
  { id: 2, name: "Priya Sharma",    email: "priya.sharma@campusconnect.edu",  department: "Information Technology", role: "student",  createdAt: new Date().toISOString() },
  { id: 3, name: "Dr. Rajesh Kumar",email: "rajesh.kumar@campusconnect.edu",  department: "Computer Science",      role: "faculty",  createdAt: new Date().toISOString() }
];

function getNextId() { return users.reduce((m, u) => Math.max(m, u.id), 0) + 1; }

function validateUser(data, partial = false) {
  const e = [];
  if (!partial || data.name !== undefined)
    if (!data.name || !data.name.trim()) e.push('name is required and must be a non-empty string');
  if (!partial || data.email !== undefined) {
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      e.push('email is required and must be a valid email address');
  }
  if (!partial || data.department !== undefined)
    if (!data.department || !data.department.trim()) e.push('department is required');
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

  console.log(`[User Service] ${m} ${p}`);

  if (p === '/health' && m === 'GET')
    return sendJSON(res, 200, { status: 'healthy', service: 'user-service', port: PORT, timestamp: new Date().toISOString() });

  if (p === '/users' && m === 'GET')
    return sendJSON(res, 200, users);

  if (p === '/users' && m === 'POST') {
    try {
      const body = await readBody(req);
      const errs = validateUser(body);
      if (errs.length) return sendJSON(res, 400, { errors: errs });
      if (users.find(u => u.email.toLowerCase() === body.email.toLowerCase().trim()))
        return sendJSON(res, 409, { error: 'A user with this email already exists' });
      const u = { id: getNextId(), name: body.name.trim(), email: body.email.toLowerCase().trim(), department: body.department.trim(), role: body.role || 'student', createdAt: new Date().toISOString() };
      users.push(u);
      return sendJSON(res, 201, u);
    } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON payload' }); }
  }

  const match = p.match(/^\/users\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const idx = users.findIndex(u => u.id === id);
    if (m === 'GET') {
      if (idx === -1) return sendJSON(res, 404, { error: `User with ID ${id} not found`, service: 'user-service' });
      return sendJSON(res, 200, users[idx]);
    }
    if (m === 'PUT') {
      if (idx === -1) return sendJSON(res, 404, { error: `User with ID ${id} not found` });
      try {
        const body = await readBody(req);
        const errs = validateUser(body, true);
        if (errs.length) return sendJSON(res, 400, { errors: errs });
        const u = users[idx];
        if (body.name)       u.name       = body.name.trim();
        if (body.email)      u.email      = body.email.toLowerCase().trim();
        if (body.department) u.department = body.department.trim();
        if (body.role)       u.role       = body.role;
        return sendJSON(res, 200, u);
      } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON payload' }); }
    }
    if (m === 'DELETE') {
      if (idx === -1) return sendJSON(res, 404, { error: `User with ID ${id} not found` });
      const [deleted] = users.splice(idx, 1);
      return sendJSON(res, 200, { message: `User ${id} deleted successfully`, deletedUser: deleted });
    }
  }

  sendJSON(res, 404, { error: 'Endpoint not found', path: p, method: m });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(` [User Service] running on port ${PORT}`);
  console.log(' Endpoints: GET/POST /users, GET/PUT/DELETE /users/:id, GET /health');
  console.log('========================================');
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
