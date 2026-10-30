/**
 * AI HTTP Route Handler - CampusConnect AI Service (Lab 9)
 * Handles endpoint routing, request validation dispatch, status code mapping,
 * and sanitized JSON responses.
 */

const { validateGenerateRequest } = require('../schemas/ai.schema');
const { generateResult, getConfig } = require('../services/ai.service');

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization'
  });
  res.end(body);
}

/**
 * Handle POST /generate (or /api/ai/generate)
 */
async function handleGenerate(req, res, body) {
  // Step 1: Input Validation (Section 4.2 & 4.4)
  const validation = validateGenerateRequest(body);
  if (!validation.isValid) {
    return sendJSON(res, 400, {
      success: false,
      error: 'ValidationError',
      message: 'Invalid request payload.',
      errors: validation.errors
    });
  }

  // Step 2: Service Invocation
  try {
    const resultData = await generateResult({
      task: body.task.trim().toLowerCase(),
      input: body.input,
      tone: body.tone,
      promptVersion: body.promptVersion
    });

    return sendJSON(res, 200, resultData);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const errorCode = err.code || 'InternalServerError';

    console.error(`[AI Service Error] [${errorCode}] ${err.message}`);

    return sendJSON(res, statusCode, {
      success: false,
      error: errorCode,
      message: err.message
    });
  }
}

/**
 * Handle GET /health
 */
function handleHealth(res) {
  const config = getConfig();
  sendJSON(res, 200, {
    status: 'UP',
    service: 'ai-service',
    port: parseInt(process.env.PORT || '3004', 10),
    timestamp: new Date().toISOString(),
    provider: config.mockMode ? 'mock' : config.provider,
    model: config.model,
    timeoutMs: config.timeoutMs,
    keyConfigured: Boolean(config.apiKey && !config.apiKey.includes('replace'))
  });
}

/**
 * Handle GET /config (Sanitized configuration for documentation & testing - Section 8.1 Deliverable 1)
 */
function handleSanitizedConfig(res) {
  const config = getConfig();
  sendJSON(res, 200, {
    service: 'ai-service',
    provider: config.mockMode ? 'mock' : config.provider,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxInputChars: parseInt(process.env.MAX_INPUT_CHARS || '5000', 10),
    keyConfigured: Boolean(config.apiKey && !config.apiKey.includes('replace')),
    keyStorage: 'process.env.AI_API_KEY (Server-side environment variable only; never serialized or committed)'
  });
}

module.exports = {
  handleGenerate,
  handleHealth,
  handleSanitizedConfig,
  sendJSON
};

