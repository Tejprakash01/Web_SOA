/**
 * Local Multi-Service Process Manager - CampusConnect Lab 7
 * Spawns API Gateway, User Service, Product Service, and Order Service concurrently.
 * Run with: node start-all.js
 */

const { spawn } = require('child_process');
const path = require('path');

const services = [
  { name: 'API Gateway',     dir: 'api-gateway',     script: 'server.js', port: 3000 },
  { name: 'User Service',    dir: 'user-service',    script: 'server.js', port: 3001 },
  { name: 'Product Service', dir: 'product-service', script: 'server.js', port: 3002 },
  { name: 'Order Service',   dir: 'order-service',   script: 'server.js', port: 3003 }
];

console.log('===========================================================');
console.log(' Starting CampusConnect Microservices System (Lab 7)');
console.log('===========================================================');

const processes = [];

services.forEach(svc => {
  const svcPath = path.join(__dirname, svc.dir);
  console.log(`🚀 Launching ${svc.name} on port ${svc.port}...`);

  const proc = spawn('node', [svc.script], {
    cwd: svcPath,
    stdio: 'pipe',
    env: { ...process.env, PORT: svc.port }
  });

  proc.stdout.on('data', (data) => {
    process.stdout.write(`[${svc.name}] ${data.toString()}`);
  });

  proc.stderr.on('data', (data) => {
    process.stderr.write(`[${svc.name} ERR] ${data.toString()}`);
  });

  proc.on('exit', (code) => {
    console.log(`[${svc.name}] Exited with code ${code}`);
  });

  processes.push(proc);
});

process.on('SIGINT', () => {
  console.log('\nStopping all microservice processes...');
  processes.forEach(p => p.kill());
  process.exit(0);
});
