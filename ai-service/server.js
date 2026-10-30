/**
 * AI Microservice Server - CampusConnect (Web Services & SOA Lab 9)
 * Port: 3004 (configurable via AI_SERVICE_PORT / PORT)
 * Provides backend GenAI capabilities: Summarization, Explanation, and Structured Study Guides.
 */

try { require('dotenv').config(); } catch (e) { }

const http = require('http');
const url = require('url');
const { handleGenerate, handleHealth, handleSanitizedConfig, sendJSON } = require('./src/routes/ai.routes');
const { recordRequest, getMetrics } = require('./metrics');

const PORT = parseInt(process.env.AI_SERVICE_PORT || process.env.PORT || 3004, 10);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      // Safeguard against oversized raw HTTP payload (> 1MB)
      if (raw.length > 1e6) {
        req.destroy(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw || !raw.trim()) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization'
    });
    return res.end();
  }

  console.log(`[AI Service] ${method} ${pathname}`);

  // Hook res.end to record Prometheus metrics
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    recordRequest(method, pathname, res.statusCode, duration);
    return originalEnd.apply(this, args);
  };

  // Route 1: Health Check (/health or /api/ai/health)
  if (method === 'GET' && (pathname === '/health' || pathname === '/api/ai/health')) {
    return handleHealth(res);
  }

  // Route 2: Prometheus Metrics Exporter (/metrics)
  if (method === 'GET' && pathname === '/metrics') {
    const metricsData = getMetrics('ai-service');
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    return res.end(metricsData);
  }

  // Route 3: Sanitized Configuration (/config or /api/ai/config)
  if (method === 'GET' && (pathname === '/config' || pathname === '/api/ai/config')) {
    return handleSanitizedConfig(res);
  }

  // Route 4: Generate Endpoint (POST /generate or POST /api/ai/generate)
  if (method === 'POST' && (pathname === '/generate' || pathname === '/api/ai/generate')) {
    try {
      const body = await readBody(req);
      return await handleGenerate(req, res, body);
    } catch (parseErr) {
      return sendJSON(res, 400, {
        success: false,
        error: 'InvalidJSON',
        message: 'Malformed JSON payload in request body.'
      });
    }
  }

  // 404 Handler for Unrecognized Endpoints
  return sendJSON(res, 404, {
    success: false,
    error: 'NotFound',
    message: `Endpoint ${method} ${pathname} not found on AI Service.`,
    validRoutes: ['/health', '/metrics', '/config', '/generate', '/api/ai/generate']
  });
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(` [AI Service] Server listening on port ${PORT}`);
  console.log(` Health:   GET  http://localhost:${PORT}/health`);
  console.log(` Config:   GET  http://localhost:${PORT}/config`);
  console.log(` Metrics:  GET  http://localhost:${PORT}/metrics`);
  console.log(` Generate: POST http://localhost:${PORT}/api/ai/generate`);
  console.log('====================================================');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

module.exports = server;

