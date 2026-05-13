const crypto = require("crypto");
const logger = require("../utils/logger");
const spaceService = require("../services/space.service");
const asyncHandler = require("../utils/asyncHandler");
const { createHttpError } = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { writeLog } = require("../utils/logging");
const {
  sanitizeAuditMetadata,
  buildRequestCorrelation,
} = require("../utils/auditMetadata");
const {
  sanitizeCreateSpaceBody,
  sanitizeUpdateSpaceBody,
  sanitizeSpaceParams,
} = require("../utils/spaceInput");

function assertLibrary(user) {
  if (user?.role !== "library") {
    throw createHttpError(403, "Forbidden");
  }
}

function collectRequestAudit(req) {
  const corr = buildRequestCorrelation(req);
  const correlationId =
    corr.correlationId ||
    corr.requestId ||
    (typeof req.get === "function" ? req.get("x-request-id") : null) ||
    crypto.randomUUID();

  return {
    method: String(req.method || "GET").toUpperCase(),
    path: req.originalUrl || req.path || "",
    ip: req.ip || req.socket?.remoteAddress || null,
    correlationId: String(correlationId).slice(0, 128),
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
    userAgent:
      typeof req.get === "function" ? req.get("user-agent") || null : null,
  };
}

function isSuspiciousRequest(req, audit) {
  const p = String(audit.path || "");
  if (/\.\.|%2e%2e/i.test(p)) return true;
  if (p.length > 4096) return true;
  return false;
}

/**
 * Best-effort structured audit (DB log + stdout). Never throws.
 * Routes may add express-rate-limit alongside this controller without API changes.
 */
function auditSpaceAction(action, req, metadata = {}) {
  const audit = collectRequestAudit(req);
  const mergedMeta = sanitizeAuditMetadata({
    ...audit,
    ...metadata,
  });

  const payload = {
    event: "space_audit",
    action,
    userId: req.user?.userId ?? null,
    role: req.user?.role ?? null,
    libraryId: req.user?.libraryId ?? null,
    ip: audit.ip,
    userAgent: audit.userAgent,
    correlationId: audit.correlationId,
    metadata: mergedMeta,
  };

  if (isSuspiciousRequest(req, audit)) {
    logger.warn("space_audit_suspicious_request", payload);
  } else {
    logger.info("space_audit", payload);
  }

  void writeLog({
    action,
    userId: req.user?.userId,
    role: req.user?.role,
    libraryId: req.user?.libraryId,
    ip: audit.ip,
    userAgent: audit.userAgent,
    metadata: mergedMeta,
  });
}

const listSpaces = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const spaces = await spaceService.listSpaces({ user: req.user });
  return sendSuccess(res, spaces, "Spaces fetched successfully");
});

const createSpace = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const body = sanitizeCreateSpaceBody(req.body);
  const space = await spaceService.createSpace({ user: req.user, body });
  auditSpaceAction("space_created", req, {
    spaceId: space?.id,
    name: space?.name,
    order: space?.order,
  });
  return sendSuccess(res, space, "Space created successfully", 201);
});

const updateSpace = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const params = sanitizeSpaceParams(req.params);
  const body = sanitizeUpdateSpaceBody(req.body);
  const space = await spaceService.updateSpace({
    user: req.user,
    params,
    body,
  });
  auditSpaceAction("space_updated", req, {
    spaceId: space?.id,
    name: space?.name,
    order: space?.order,
  });
  return sendSuccess(res, space, "Space updated successfully");
});

const deleteSpace = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const params = sanitizeSpaceParams(req.params);
  const result = await spaceService.deleteSpace({
    user: req.user,
    params,
  });
  auditSpaceAction("space_deleted", req, {
    spaceId: params.id,
  });
  return sendSuccess(res, result, "Space deleted successfully");
});

module.exports = {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
};
