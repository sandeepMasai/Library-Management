const Log = require("../models/Log");
const logger = require("./logger");
const { sanitizeAuditMetadata } = require("./auditMetadata");

const SEVERITY_ENUM = new Set([
  "debug",
  "info",
  "warn",
  "error",
  "security",
]);

/**
 * Best-effort log write (never throws to callers).
 * On persist failure: emits structured `logger.warn` so failures are not silent.
 */
async function writeLog(entry = {}) {
  let sanitizedMeta = null;
  try {
    const doc = {
      action: String(entry.action || "").trim(),
      userId: entry.userId ? String(entry.userId) : null,
      role: entry.role ? String(entry.role) : null,
      libraryId: entry.libraryId || null,
      timestamp: entry.timestamp || new Date(),
    };
    if (entry.ip != null) doc.ip = String(entry.ip).slice(0, 80);
    if (entry.userAgent != null) {
      doc.userAgent = String(entry.userAgent).slice(0, 500);
    }
    if (entry.metadata != null) {
      sanitizedMeta = sanitizeAuditMetadata(entry.metadata);
      doc.metadata = sanitizedMeta;
    }
    if (entry.metrics != null && typeof entry.metrics === "object") {
      const m = sanitizeAuditMetadata(entry.metrics);
      doc.metadata = doc.metadata
        ? { ...doc.metadata, _metrics: m }
        : { _metrics: m };
    }
    if (entry.severity != null) {
      const sev = String(entry.severity).trim().toLowerCase();
      if (SEVERITY_ENUM.has(sev)) doc.severity = sev;
    }
    const createOpts = entry.session ? { session: entry.session } : {};
    await Log.create(doc, createOpts);
  } catch (error) {
    let preview = null;
    try {
      preview =
        sanitizedMeta != null
          ? safeJsonPreview(sanitizedMeta, 900)
          : entry.metadata != null
            ? safeJsonPreview(
              sanitizeAuditMetadata(entry.metadata) || {},
              900
            )
            : null;
    } catch {
      preview = "[preview_unavailable]";
    }
    logger.warn("audit_log_persist_failed", {
      event: "audit_log_persist_failed",
      action: entry.action,
      userId: entry.userId ?? null,
      role: entry.role ?? null,
      libraryId: entry.libraryId ? String(entry.libraryId) : null,
      message: error?.message,
      code: error?.code,
      name: error?.name,
      metadataPreview: preview,
    });
  }
}

function safeJsonPreview(obj, maxBytes) {
  try {
    const s = JSON.stringify(obj);
    const buf = Buffer.byteLength(s, "utf8");
    if (buf <= maxBytes) return s;
    return `${s.slice(0, Math.floor(maxBytes / 2))}…`;
  } catch {
    return "[preview_unavailable]";
  }
}

module.exports = { writeLog };
