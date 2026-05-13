const mongoose = require("mongoose");

const ROLE_ENUM = Object.freeze(["admin", "library", "student"]);
const ACTOR_MODEL_ENUM = Object.freeze(["Library", "Student"]);
const SEVERITY_ENUM = Object.freeze(["debug", "info", "warn", "error", "security"]);

const DEFAULT_TTL_DAYS = Number.parseInt(process.env.AUDIT_LOG_TTL_DAYS || "180", 10);
const TTL_SECONDS =
  Number.isFinite(DEFAULT_TTL_DAYS) && DEFAULT_TTL_DAYS > 0 ? DEFAULT_TTL_DAYS * 24 * 60 * 60 : null;

const DEFAULT_METADATA_MAX_BYTES = Number.parseInt(process.env.AUDIT_LOG_METADATA_MAX_BYTES || "8192", 10);
const METADATA_MAX_BYTES =
  Number.isFinite(DEFAULT_METADATA_MAX_BYTES) && DEFAULT_METADATA_MAX_BYTES > 0
    ? DEFAULT_METADATA_MAX_BYTES
    : 8192;

function isMetadataWithinLimit(value) {
  if (value == null) return true;
  try {
    // Lightweight approximation (prevents huge payloads); avoids pulling in BSON deps.
    const json = JSON.stringify(value);
    return Buffer.byteLength(json, "utf8") <= METADATA_MAX_BYTES;
  } catch (_) {
    return false;
  }
}

/**
 * System activity log (admin/audit trail)
 *
 * What we track:
 * - action: what happened (login, student_created, student_deleted, attendance_marked, ...)
 * - userId/role: who performed it (or which account)
 * - libraryId: tenant scope (null for admin global events)
 * - timestamp: when it happened
 */
const logSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      index: true,
    },
    // Actor who performed the action (optional).
    // Keep `userId` name for backward compatibility; optionally set `actorModel` for correct populate.
    actorModel: { type: String, enum: ACTOR_MODEL_ENUM, default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, refPath: "actorModel", default: null, index: true },
    role: { type: String, enum: ROLE_ENUM, default: null, trim: true, index: true },
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", default: null, index: true },
    timestamp: { type: Date, required: true, default: Date.now, immutable: true },
    severity: { type: String, enum: SEVERITY_ENUM, default: "info", index: true },
    retainForever: { type: Boolean, default: false, index: true },
    ip: { type: String, default: null, trim: true, maxlength: 80 },
    userAgent: { type: String, default: null, trim: true, maxlength: 500 },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      validate: {
        validator: isMetadataWithinLimit,
        message: `metadata exceeds max allowed size (${METADATA_MAX_BYTES} bytes)`,
      },
    },
  },
  { timestamps: false, strict: true }
);

logSchema.set("toJSON", { versionKey: false });
logSchema.set("toObject", { versionKey: false });
logSchema.set("strictQuery", true);

// Audit query performance
logSchema.index({ libraryId: 1, timestamp: -1 });
logSchema.index({ userId: 1, timestamp: -1 });
logSchema.index({ libraryId: 1, action: 1, timestamp: -1 });
logSchema.index({ severity: 1, timestamp: -1 });

// TTL cleanup (MongoDB will delete docs after TTL from `timestamp`)
if (TTL_SECONDS) {
  logSchema.index(
    { timestamp: 1 },
    { expireAfterSeconds: TTL_SECONDS, partialFilterExpression: { retainForever: { $ne: true } } }
  );
}

// Reusable action helpers (optional)
logSchema.statics.SEVERITY = SEVERITY_ENUM;
logSchema.statics.ROLE = ROLE_ENUM;
logSchema.statics.normalizeAction = (action) => String(action || "").trim().toLowerCase();

module.exports = mongoose.model("Log", logSchema);

