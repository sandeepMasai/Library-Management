const mongoose = require("mongoose");
const { createHttpError } = require("./httpError");

/** Aligned with Space schema maxlength. */
const SPACE_NAME_MAX_LENGTH = 120;

/** Sort index bounds (defensive; keeps Mongo integer-safe range practical). */
const SPACE_ORDER_MIN = -10_000_000;
const SPACE_ORDER_MAX = 10_000_000;

function normalizeUnicodeText(raw) {
  return String(raw ?? "").normalize("NFC").trim();
}

/**
 * Stable ObjectId string for route params (tenant checks remain in services).
 */
function parseSpaceIdParam(rawId, fieldName = "space id") {
  const id = normalizeUnicodeText(rawId);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, `Invalid ${fieldName}`);
  }
  return id;
}

/**
 * Integer order only; rejects NaN, Infinity, non-integers, unsafe integers.
 * Returns `undefined` when `value` is undefined (field omitted).
 */
function parseSpaceOrder(value, { fieldName = "order", allowUndefined = true } = {}) {
  if (value === undefined) {
    if (allowUndefined) return undefined;
    throw createHttpError(400, `${fieldName} is required`);
  }
  if (value === null) {
    throw createHttpError(400, `${fieldName} must be a valid integer`);
  }
  if (typeof value === "boolean") {
    throw createHttpError(400, `${fieldName} must be a valid integer`);
  }
  if (typeof value === "string" && value.trim() === "") {
    throw createHttpError(400, `${fieldName} must be a valid integer`);
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw createHttpError(400, `${fieldName} must be a valid number`);
  }
  if (!Number.isInteger(n)) {
    throw createHttpError(400, `${fieldName} must be an integer`);
  }
  if (!Number.isSafeInteger(n)) {
    throw createHttpError(400, `${fieldName} is out of allowed range`);
  }
  if (n < SPACE_ORDER_MIN || n > SPACE_ORDER_MAX) {
    throw createHttpError(
      400,
      `${fieldName} must be between ${SPACE_ORDER_MIN} and ${SPACE_ORDER_MAX}`
    );
  }
  return n;
}

function parseSpaceName(raw, { required = true, fieldName = "name" } = {}) {
  const name = normalizeUnicodeText(raw);
  if (!name) {
    if (required) throw createHttpError(400, `${fieldName} is required`);
    return "";
  }
  if (name.length > SPACE_NAME_MAX_LENGTH) {
    throw createHttpError(
      400,
      `${fieldName} must be at most ${SPACE_NAME_MAX_LENGTH} characters`
    );
  }
  return name;
}

function sanitizeCreateSpaceBody(body = {}) {
  const name = parseSpaceName(body.name, { required: true });
  const out = { name };
  if (body.order !== undefined) {
    out.order = parseSpaceOrder(body.order, {
      fieldName: "order",
      allowUndefined: false,
    });
  }
  return out;
}

function sanitizeUpdateSpaceBody(body = {}) {
  const sanitized = {};

  if (body.name !== undefined) {
    sanitized.name = parseSpaceName(body.name, {
      required: true,
      fieldName: "name",
    });
  }

  if (body.order !== undefined) {
    sanitized.order = parseSpaceOrder(body.order, {
      fieldName: "order",
      allowUndefined: false,
    });
  }

  if (!Object.keys(sanitized).length) {
    throw createHttpError(400, "No space fields provided");
  }

  return sanitized;
}

function sanitizeSpaceParams(params = {}) {
  return { id: parseSpaceIdParam(params.id, "space id") };
}

module.exports = {
  SPACE_NAME_MAX_LENGTH,
  SPACE_ORDER_MIN,
  SPACE_ORDER_MAX,
  normalizeUnicodeText,
  parseSpaceIdParam,
  parseSpaceOrder,
  parseSpaceName,
  sanitizeCreateSpaceBody,
  sanitizeUpdateSpaceBody,
  sanitizeSpaceParams,
};
