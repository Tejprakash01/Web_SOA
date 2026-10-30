/**
 * AI Schema & Request Validator - CampusConnect AI Service (Lab 9)
 * Validates request payload structure, field types, constraints, and structured output shapes.
 */

const SUPPORTED_TASKS = ['summarize', 'explain', 'structured_summary'];
const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '5000', 10);

/**
 * Validates the incoming HTTP request body for POST /api/ai/generate
 * @param {any} body - Raw parsed JSON body from request
 * @returns {{ isValid: boolean, errors: string[] }}
 */
function validateGenerateRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: ['Request body must be a valid JSON object.']
    };
  }

  // 1. Task validation
  if (body.task === undefined || body.task === null) {
    errors.push("Missing required field: 'task'.");
  } else if (typeof body.task !== 'string') {
    errors.push("'task' must be a string.");
  } else {
    const normalizedTask = body.task.trim().toLowerCase();
    if (!SUPPORTED_TASKS.includes(normalizedTask)) {
      errors.push(`Unsupported task '${body.task}'. Supported tasks: ${SUPPORTED_TASKS.join(', ')}.`);
    }
  }

  // 2. Input validation
  if (body.input === undefined || body.input === null) {
    errors.push("Missing required field: 'input'.");
  } else if (typeof body.input !== 'string') {
    errors.push("'input' must be a string.");
  } else {
    const trimmedInput = body.input.trim();
    if (trimmedInput.length === 0) {
      errors.push("'input' cannot be empty or whitespace-only.");
    } else if (trimmedInput.length > MAX_INPUT_CHARS) {
      errors.push(`Input length (${trimmedInput.length} chars) exceeds configured limit of ${MAX_INPUT_CHARS} characters.`);
    }
  }

  // 3. Optional tone validation
  if (body.tone !== undefined && typeof body.tone !== 'string') {
    errors.push("'tone' must be a string when provided.");
  }

  // 4. Optional promptVersion validation
  if (body.promptVersion !== undefined) {
    if (typeof body.promptVersion !== 'string' || !['minimal', 'improved'].includes(body.promptVersion.toLowerCase())) {
      errors.push("'promptVersion' must be either 'minimal' or 'improved'.");
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates that an object conforms to the structured summary schema (Section 5.3)
 * Expected Schema:
 * {
 *   "title": string,
 *   "summary": string,
 *   "key_points": string[]
 * }
 * @param {any} data
 * @returns {{ isValid: boolean, errors: string[] }}
 */
function validateStructuredOutput(data) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { isValid: false, errors: ['Output must be a JSON object.'] };
  }

  if (typeof data.title !== 'string' || !data.title.trim()) {
    errors.push("Field 'title' is required and must be a non-empty string.");
  }

  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    errors.push("Field 'summary' is required and must be a non-empty string.");
  }

  if (!Array.isArray(data.key_points)) {
    errors.push("Field 'key_points' is required and must be an array of strings.");
  } else if (data.key_points.length === 0) {
    errors.push("Field 'key_points' array must contain at least one string item.");
  } else {
    for (let i = 0; i < data.key_points.length; i++) {
      if (typeof data.key_points[i] !== 'string' || !data.key_points[i].trim()) {
        errors.push(`Item at key_points[${i}] must be a non-empty string.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  SUPPORTED_TASKS,
  MAX_INPUT_CHARS,
  validateGenerateRequest,
  validateStructuredOutput
};

