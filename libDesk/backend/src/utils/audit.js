const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const logger = require("./logger");
const {
  sanitizeAuditMetadata,
  buildRequestCorrelation,
} = require("./auditMetadata");

const ROLE_ENUM =
  AuditLog.schema.path("role").enumValues || ["admin", "library", "student"];
const ALLOWED_ROLES = new Set(ROLE_ENUM.map((r) => String(r).toLowerCase()));

const MAX_ACTION_LENGTH = 120;
const MAX_IP_LENGTH = 128;
const MAX_UA_LENGTH = 512;
const MAX_METADATA_JSON_CHARS = 24_000;

const hooks = {
  onWrite: null,
  onSkip: null,
  onFailure: null,
};

function setAuditHooks(patch = {}) {
  Object.assign(hooks, patch);
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isTruthyEnv(name) {
  const v = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1";
}

function getRetryCount() {
  const raw = Number.parseInt(process.env.AUDIT_LOG_RETRY_COUNT || "0", 10);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 5) : 0;
}

function getRetryDelayMs() {
  const raw = Number.parseInt(process.env.AUDIT_LOG_RETRY_DELAY_MS || "40", 10);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 5000) : 40;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(str, max) {
  const s = String(str ?? "");
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Actions: lowercase alphanumerics, dots, underscores, hyphens (matches current usage).
 */
function normalizeAction(action) {
  const s = String(action ?? "").trim().toLowerCase();
  if (!s || s.length > MAX_ACTION_LENGTH) return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(s)) return null;
  return s;
}

function normalizeAuditRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r || !ALLOWED_ROLES.has(r)) return null;
  return r;
}

function coerceObjectIdOrNull(value) {
  if (value == null || value === "") return null;
  const s =
    value instanceof mongoose.Types.ObjectId
      ? value.toString()
      : String(value);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return s;
}

function buildMetadataEnvelope(entry) {
  const envelope = {};
  if (entry.severity != null && String(entry.severity).trim()) {
    envelope.severity = truncate(String(entry.severity).trim(), 32);
  }

  const c = entry.req ? buildRequestCorrelation(entry.req) : {};
  const correlationId = entry.correlationId ?? c.correlationId;
  const requestId = entry.requestId ?? c.requestId;
  const idempotencyKey = entry.idempotencyKey ?? c.idempotencyKey;
  if (correlationId) envelope.correlationId = String(correlationId).slice(0, 128);
  if (requestId) envelope.requestId = String(requestId).slice(0, 128);
  if (idempotencyKey) {
    envelope.idempotencyKey = String(idempotencyKey).slice(0, 128);
  }

  if (Object.keys(envelope).length === 0) return null;
  return envelope;
}

/**
 * When role is not in AuditLog enum (e.g. staff), keep schema-safe null but preserve hint in metadata.
 */
function maybeRoleHint(entry, normalizedRole) {
  if (normalizedRole != null) return {};
  const raw = entry.role;
  if (raw == null || raw === "") return {};
  const hint = String(raw).trim().toLowerCase().slice(0, 32);
  if (!hint) return {};
  return { roleHint: hint };
}

function materializeForAudit(value, depth = 10) {
  if (value == null) return value;
  if (depth <= 0) return "[max-depth]";
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => materializeForAudit(v, depth - 1));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = materializeForAudit(v, depth - 1);
    }
    return out;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value.toJSON === "function") {
    try {
      return materializeForAudit(value.toJSON(), depth - 1);
    } catch {
      /* fall through */
    }
  }
  return String(value);
}

function mergeMetadata(entry) {
  const envelope = buildMetadataEnvelope(entry);
  const roleHint = maybeRoleHint(entry, normalizeAuditRole(entry.role));

  let base = entry.metadata;
  if (base == null) {
    base = {};
  } else if (!isPlainObject(base) && !Array.isArray(base)) {
    base = { value: truncate(String(base), 400) };
  }

  let merged;
  if (Array.isArray(base)) {
    merged = [...base];
    if (envelope || Object.keys(roleHint).length) {
      merged.push({
        _audit: { ...(envelope || {}), ...roleHint },
      });
    }
  } else {
    merged = { ...base };
    if (envelope || Object.keys(roleHint).length) {
      merged._audit = { ...(envelope || {}), ...roleHint };
    }
  }

  const materialized = materializeForAudit(merged);
  const sanitized = sanitizeAuditMetadata(materialized, { maxDepth: 6 });
  const json = JSON.stringify(sanitized ?? null);
  if (json.length <= MAX_METADATA_JSON_CHARS) {
    return sanitized;
  }
  return sanitizeAuditMetadata(
    {
      _oversized: true,
      approxBytes: json.length,
      preview: truncate(json, 800),
    },
    { maxDepth: 3 }
  );
}

function buildCreatePayload(entry) {
  const action = normalizeAction(entry.action);
  if (!action) {
    logger.warn("Audit skipped: invalid or empty action", {
      event: "audit_skip",
      reason: "invalid_action",
      actionSample: truncate(String(entry.action ?? ""), 48),
    });
    try {
      hooks.onSkip?.({ reason: "invalid_action", entry });
    } catch (e) {
      logger.warn("audit onSkip hook failed", { message: e?.message });
    }
    return null;
  }

  const role = normalizeAuditRole(entry.role);
  const userId = coerceObjectIdOrNull(entry.userId);
  const libraryId = coerceObjectIdOrNull(entry.libraryId);

  return {
    action,
    userId,
    role,
    libraryId,
    ip: entry.ip != null ? truncate(String(entry.ip), MAX_IP_LENGTH) : null,
    userAgent:
      entry.userAgent != null
        ? truncate(String(entry.userAgent), MAX_UA_LENGTH)
        : null,
    metadata: mergeMetadata(entry),
    timestamp: coerceTimestamp(entry.timestamp),
  };
}

function coerceTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value != null && value !== "") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function logAuditWriteFailure(error, payload, startedAt) {
  logger.warn("Audit log write failed", {
    event: "audit_write_failed",
    durationMs: Date.now() - startedAt,
    action: payload?.action,
    message: error?.message,
    name: error?.name,
    code: error?.code,
  });
  try {
    hooks.onFailure?.({
      error,
      payload,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    logger.warn("audit onFailure hook failed", { message: e?.message });
  }

  if (isTruthyEnv("AUDIT_LOG_FALLBACK_STDOUT")) {
    logger.info("audit_fallback_digest", {
      event: "audit_fallback",
      action: payload?.action,
      userId: payload?.userId,
      libraryId: payload?.libraryId,
      role: payload?.role,
      metadataKeys:
        payload?.metadata != null && typeof payload.metadata === "object"
          ? Object.keys(payload.metadata).slice(0, 48)
          : [],
    });
  }
}

async function persistWithRetries(payload, startedAt) {
  const attempts = 1 + getRetryCount();
  const delayMs = getRetryDelayMs();
  let lastError;

  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await AuditLog.create(payload);
      const durationMs = Date.now() - startedAt;
      if (isTruthyEnv("AUDIT_LOG_DEBUG_TIMING")) {
        logger.debug("Audit write ok", {
          event: "audit_write_ok",
          action: payload.action,
          durationMs,
        });
      }
      try {
        hooks.onWrite?.({ action: payload.action, durationMs });
      } catch (e) {
        logger.warn("audit onWrite hook failed", { message: e?.message });
      }
      return;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(delayMs);
      }
    }
  }

  logAuditWriteFailure(lastError, payload, startedAt);
}

/**
 * Centralized audit row. Failures are isolated (never thrown to callers).
 * Optional `entry.req` merges correlation into sanitized metadata under `_audit`.
 * Optional `entry.severity` is copied into `_audit.severity`.
 * Optional `entry.defer: true` schedules the write on the next tick (await resolves before DB write).
 */
async function logAction(entry = {}) {
  const startedAt = Date.now();
  const payload = buildCreatePayload(entry);
  if (!payload) return;

  if (entry.defer === true) {
    setImmediate(() => {
      void persistWithRetries(payload, startedAt);
    });
    return;
  }

  await persistWithRetries(payload, startedAt);
}

/**
 * Non-blocking audit: same as logAction with defer enabled (for hot paths).
 */
function scheduleAudit(entry) {
  return logAction({ ...entry, defer: true });
}

module.exports = {
  logAction,
  setAuditHooks,
  scheduleAudit,
};
