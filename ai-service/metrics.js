/**
 * Lightweight Zero-Dependency Prometheus Metrics Collector
 * Web Services & SOA Lab 9 - CampusConnect AI Service
 */

const startTime = Date.now();
const requestCounts = {};
const requestDurations = {};

function recordRequest(method, route, statusCode, durationMs) {
  const normRoute = route.split('?')[0].replace(/\/\d+/g, '/:id') || '/';
  const countKey = `${method}|${normRoute}|${statusCode}`;
  requestCounts[countKey] = (requestCounts[countKey] || 0) + 1;

  const durationKey = `${method}|${normRoute}`;
  requestDurations[durationKey] = (requestDurations[durationKey] || 0) + (durationMs / 1000);
}

function getMetrics(serviceName) {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const lines = [
    `# HELP app_uptime_seconds System uptime in seconds`,
    `# TYPE app_uptime_seconds gauge`,
    `app_uptime_seconds{service="${serviceName}"} ${uptimeSeconds}`,
    ``,
    `# HELP app_info Metadata about the application service`,
    `# TYPE app_info gauge`,
    `app_info{service="${serviceName}",version="1.0.0"} 1`,
    ``,
    `# HELP http_requests_total Total number of HTTP requests`,
    `# TYPE http_requests_total counter`
  ];

  for (const [key, count] of Object.entries(requestCounts)) {
    const [m, r, s] = key.split('|');
    lines.push(`http_requests_total{service="${serviceName}",method="${m}",route="${r}",status="${s}"} ${count}`);
  }

  lines.push(``);
  lines.push(`# HELP http_request_duration_seconds Total request handling duration in seconds`);
  lines.push(`# TYPE http_request_duration_seconds counter`);

  for (const [key, dur] of Object.entries(requestDurations)) {
    const [m, r] = key.split('|');
    lines.push(`http_request_duration_seconds{service="${serviceName}",method="${m}",route="${r}"} ${dur.toFixed(4)}`);
  }

  lines.push(``);
  return lines.join('\n');
}

module.exports = { recordRequest, getMetrics };

