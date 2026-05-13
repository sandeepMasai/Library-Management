const mongoose = require("mongoose");

const AUDIT_ROLES = Object.freeze([
  "admin",
  "library",
  "student",
]);

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    role: {
      type: String,
      enum: AUDIT_ROLES,
      default: null,
      index: true,
    },

    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      default: null,
      index: true,
    },

    ip: {
      type: String,
      default: null,
      trim: true,
    },

    userAgent: {
      type: String,
      default: null,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false },
  }
);

// Query optimization
auditLogSchema.index({ libraryId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ libraryId: 1, action: 1, createdAt: -1 });

// Auto cleanup after 180 days
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 180 }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);