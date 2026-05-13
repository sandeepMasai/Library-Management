/**
 * Sanitize audit/log metadata: strip secrets, bound size, shallow depth.
 * Safe for Mongo Log.metadata and structured stdout logs.
 */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pin|secret|token|auth|cookie|session|apikey|api[_-]?key|bearer|credential|cvv|ssn|card|pan|private[_-]?key)/i;

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_KEYS_PER_LEVEL = 48;
const DEFAULT_MAX_STRING = 512;
const DEFAULT_MAX_ARRAY = 24;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function redactKey(key) {
  return SENSITIVE_KEY_PATTERN.test(String(key || ""));
}

function truncateString(s) {
  const str = String(s);
  if (str.length <= DEFAULT_MAX_STRING) return str;
  return `${str.slice(0, DEFAULT_MAX_STRING)}…`;
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
function sanitizeValue(value, depth) {
  if (value === null || value === undefined) return value;
  if (depth <= 0) return "[max-depth]";

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < Math.min(value.length, DEFAULT_MAX_ARRAY); i += 1) {
      out.push(sanitizeValue(value[i], depth - 1));
    }
    if (value.length > DEFAULT_MAX_ARRAY) {
      out.push(`[truncated:${value.length - DEFAULT_MAX_ARRAY} more]`);
    }
    return out;
  }
  if (isPlainObject(value)) {
    return sanitizeObject(value, depth - 1);
  }
  return "[unserializable]";
}

function sanitizeObject(obj, depth) {
  if (depth <= 0) return "[max-depth]";
  const out = {};
  const keys = Object.keys(obj);
  let count = 0;
  for (const key of keys) {
    if (count >= DEFAULT_MAX_KEYS_PER_LEVEL) {
      out._truncatedKeys = keys.length - count;
      break;
    }
    if (redactKey(key)) {
      out[key] = "[REDACTED]";
      count += 1;
      continue;
    }
    out[key] = sanitizeValue(obj[key], depth);
    count += 1;
  }
  return out;
}

/**
 * @param {unknown} metadata
 * @param {{ maxDepth?: number }} [opts]
 */
function sanitizeAuditMetadata(metadata, opts = {}) {
  if (metadata == null) return null;
  const maxDepth = Number(opts.maxDepth) || DEFAULT_MAX_DEPTH;
  if (!isPlainObject(metadata) && !Array.isArray(metadata)) {
    return { value: truncateString(String(metadata)) };
  }
  try {
    return sanitizeValue(metadata, maxDepth);
  } catch {
    return { _sanitizeError: true };
  }
}

/**
 * Correlation / idempotency hints for tracing (no PII beyond request ids).
 */
function buildRequestCorrelation(req) {
  if (!req) {
    return {
      correlationId: null,
      requestId: null,
      idempotencyKey: null,
    };
  }
  const get = typeof req.get === "function" ? (h) => req.get(h) : () => null;
  const correlationId =
    get("x-correlation-id") ||
    get("x-request-id") ||
    req.id ||
    null;
  const requestId = get("x-request-id") || req.id || null;
  const idempotencyKey = get("x-idempotency-key") || null;

  return {
    correlationId: correlationId ? String(correlationId).slice(0, 128) : null,
    requestId: requestId ? String(requestId).slice(0, 128) : null,
    idempotencyKey: idempotencyKey
      ? String(idempotencyKey).slice(0, 128)
      : null,
  };
}

module.exports = {
  sanitizeAuditMetadata,
  buildRequestCorrelation,
  SENSITIVE_KEY_PATTERN,
};
