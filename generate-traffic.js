/**
 * Traffic Generator Script for Prometheus & Grafana Monitoring Demonstration
 * Web Services & SOA Lab 8 - CampusConnect Platform
 *
 * Usage:
 *   node generate-traffic.js [gateway-url] [number-of-iterations]
 * Example:
 *   node generate-traffic.js http://localhost:30080 20
 */

const http = require('http');
const https = require('https');
const url = require('url');

const GATEWAY_URL = process.argv[2] || process.env.GATEWAY_URL || 'http://localhost:30080';
const ITERATIONS = parseInt(process.argv[3] || '15', 10);

function sendRequest(targetUrl, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const parsed = new url.URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 3000
    };

    const startTime = Date.now();
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          duration: Date.now() - startTime,
          success: res.statusCode >= 200 && res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message, duration: Date.now() - startTime, success: false });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('========================================================');
  console.log(` CampusConnect Monitoring Traffic Generator (Lab 8)`);
  console.log(` Target Gateway: ${GATEWAY_URL}`);
  console.log(` Iterations:     ${ITERATIONS}`);
  console.log('========================================================\n');

  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`--- [Iteration ${i}/${ITERATIONS}] ---`);

    // 1. Health check
    let r = await sendRequest(`${GATEWAY_URL}/health`);
    console.log(`  GET /health            -> HTTP ${r.status} (${r.duration}ms)`);

    // 2. Fetch Users
    r = await sendRequest(`${GATEWAY_URL}/users`);
    console.log(`  GET /users             -> HTTP ${r.status} (${r.duration}ms)`);

    // 3. Fetch Single User
    r = await sendRequest(`${GATEWAY_URL}/users/1`);
    console.log(`  GET /users/1           -> HTTP ${r.status} (${r.duration}ms)`);

    // 4. Fetch Products
    r = await sendRequest(`${GATEWAY_URL}/products`);
    console.log(`  GET /products          -> HTTP ${r.status} (${r.duration}ms)`);

    // 5. Fetch Single Product
    r = await sendRequest(`${GATEWAY_URL}/products/101`);
    console.log(`  GET /products/101      -> HTTP ${r.status} (${r.duration}ms)`);

    // 6. Fetch Orders
    r = await sendRequest(`${GATEWAY_URL}/orders`);
    console.log(`  GET /orders            -> HTTP ${r.status} (${r.duration}ms)`);

    // 7. Place New Order
    r = await sendRequest(`${GATEWAY_URL}/orders`, 'POST', {
      userId: 1,
      productId: 101,
      quantity: 1,
      notes: `Load test order #${i}`
    });
    console.log(`  POST /orders           -> HTTP ${r.status} (${r.duration}ms)`);

    // 8. Intentional 404 error (to observe Error metrics in Grafana)
    r = await sendRequest(`${GATEWAY_URL}/non-existent-route`);
    console.log(`  GET /non-existent      -> HTTP ${r.status} (Intentional 404)`);

    // 9. Intentional 404 user not found
    r = await sendRequest(`${GATEWAY_URL}/users/9999`);
    console.log(`  GET /users/9999        -> HTTP ${r.status} (Intentional 404)`);

    await sleep(400);
  }

  console.log('\n========================================================');
  console.log(' Traffic Generation Completed Successfully!');
  console.log(' Check Prometheus: http://localhost:30090/graph');
  console.log(' Check Grafana:    http://localhost:31000');
  console.log('========================================================');
}

run();
