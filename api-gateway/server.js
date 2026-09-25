/**
 * API Gateway Microservice - CampusConnect (Web Services & SOA Lab 7)
 * Single entry point for routing, logging, service discovery configuration, and centralized 502/503 error handling.
 * Default Port: 3000 (configurable via PORT environment variable)
 * Zero-dependency mode: Uses Node.js native http/https modules for maximum performance and portability.
 */

try { require('dotenv').config(); } catch (e) {}

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = parseInt(process.env.PORT || process.env.GATEWAY_PORT || 3000, 10);

/**
 * Service Discovery Registry (Configuration-Based)
 * Dynamic service URLs populated from environment variables
 */
function normalizeUrl(rawUrl, defaultUrl) {
  let u = (rawUrl || defaultUrl).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  return u;
}

function getServiceRegistry() {
  return {
    userService: normalizeUrl(process.env.USER_SERVICE_URL, 'http://localhost:3001'),
    productService: normalizeUrl(process.env.PRODUCT_SERVICE_URL, 'http://localhost:3002'),
    orderService: normalizeUrl(process.env.ORDER_SERVICE_URL, 'http://localhost:3003')
  };
}

function sendJSON(res, code, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization'
  });
  res.end(body);
}

/**
 * HTTP/HTTPS Reverse Proxy Handler
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} targetBaseUrl - Base URL of downstream service
 * @param {string} serviceName - Friendly name of downstream service
 */
function proxyRequest(req, res, targetBaseUrl, serviceName) {
  const startTime = Date.now();
  const fullTargetUrlStr = `${targetBaseUrl}${req.url}`;

  try {
    const targetParsed = new url.URL(fullTargetUrlStr);
    const transport = targetParsed.protocol === 'https:' ? https : http;

    const headers = { ...req.headers };
    headers.host = targetParsed.host;
    headers['x-forwarded-for'] = req.socket.remoteAddress || '127.0.0.1';
    headers['x-forwarded-host'] = req.headers.host || `localhost:${PORT}`;
    headers['x-forwarded-proto'] = 'http';

    const options = {
      hostname: targetParsed.hostname,
      port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
      path: targetParsed.pathname + targetParsed.search,
      method: req.method,
      headers: headers,
      timeout: 5000
    };

    const proxyReq = transport.request(options, (proxyRes) => {
      // Forward status and headers
      const resHeaders = { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' };
      res.writeHead(proxyRes.statusCode, resHeaders);
      proxyRes.pipe(res);

      proxyRes.on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`[API Gateway Proxy] ${req.method} ${req.url} -> ${serviceName} | HTTP ${proxyRes.statusCode} (${duration}ms)`);
      });
    });

    // Centralized 503 Error Handling for Unreachable or Stopped Services
    proxyReq.on('error', (err) => {
      const duration = Date.now() - startTime;
      console.error(`[API Gateway Error] Failed to proxy ${req.method} ${req.url} to ${serviceName}: ${err.message} (${duration}ms)`);

      if (!res.headersSent) {
        sendJSON(res, 503, {
          error: 'Service Unavailable',
          statusCode: 503,
          message: `The downstream microservice '${serviceName}' is currently unreachable or stopped.`,
          service: serviceName,
          targetUrl: fullTargetUrlStr,
          timestamp: new Date().toISOString(),
          details: err.message,
          troubleshooting: `Ensure ${serviceName} is running and accessible at ${targetBaseUrl}`
        });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('Connection timed out after 5000ms'));
    });

    req.pipe(proxyReq);

  } catch (err) {
    console.error(`[API Gateway Invalid Proxy Target] ${err.message}`);
    if (!res.headersSent) {
      sendJSON(res, 502, {
        error: 'Bad Gateway',
        statusCode: 502,
        message: `Invalid service URL configuration for '${serviceName}'`,
        details: err.message
      });
    }
  }
}

const server = http.createServer((req, res) => {
  const reqUrlParsed = url.parse(req.url);
  const pathname = reqUrlParsed.pathname;

  // Handle CORS Preflight OPTIONS Request
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization'
    });
    return res.end();
  }

  // Logging Request
  console.log(`[API Gateway Log] ${new Date().toISOString()} | ${req.method} ${req.url}`);

  const registry = getServiceRegistry();

  // Route 1: Gateway Health Check
  if (pathname === '/health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      status: 'UP',
      service: 'api-gateway',
      port: PORT,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      serviceRegistry: registry,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  // Route 2: User Service Proxy (/users, /users/*)
  if (pathname === '/users' || pathname.startsWith('/users/')) {
    return proxyRequest(req, res, registry.userService, 'user-service');
  }

  // Route 3: Product Service Proxy (/products, /products/*)
  if (pathname === '/products' || pathname.startsWith('/products/')) {
    return proxyRequest(req, res, registry.productService, 'product-service');
  }

  // Route 4: Order Service Proxy (/orders, /orders/*)
  if (pathname === '/orders' || pathname.startsWith('/orders/')) {
    return proxyRequest(req, res, registry.orderService, 'order-service');
  }

  // Centralized 404 Handler for Unmatched Gateway Paths
  sendJSON(res, 404, {
    error: 'Not Found',
    statusCode: 404,
    message: `No proxy route defined on API Gateway for path: ${pathname}`,
    validRoutes: ['/health', '/users', '/users/:id', '/products', '/products/:id', '/orders', '/orders/:id']
  });
});

server.listen(PORT, () => {
  const registry = getServiceRegistry();
  console.log('====================================================');
  console.log(` [API Gateway] Server listening on port ${PORT}`);
  console.log(` Environment Service Discovery Registry:`);
  console.log(`   - User Service:    ${registry.userService}`);
  console.log(`   - Product Service: ${registry.productService}`);
  console.log(`   - Order Service:   ${registry.orderService}`);
  console.log(` Health Check: GET http://localhost:${PORT}/health`);
  console.log('====================================================');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
