const mongoose = require("mongoose");

const USER_ROLES = [
  "admin",
  "library",
  "student",
  "staff",
];

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    tokenId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    familyId: {
      type: String,
      required: true,
      immutable: true,
      index: true,
    },

    /**
     * JWT subject id (same string as access token payload userId).
     * Supports Mongo ObjectId strings and legacy keys like "admin-1".
     */
    userId: {
      type: String,
      required: true,
      immutable: true,
      index: true,
      maxlength: 128,
      trim: true,
    },

    /** Optional link to centralized User document for audit / enterprise RBAC. */
    identityUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      immutable: true,
      index: true,
    },

    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      default: null,
      immutable: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },

    reuseDetectedAt: {
      type: Date,
      default: null,
    },

    replacedByTokenHash: {
      type: String,
      default: null,
    },

    ip: {
      type: String,
      default: null,
      trim: true,
      maxlength: 80,
    },

    userAgent: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    deviceId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: { versionKey: false },
  }
);

refreshTokenSchema.set("strictQuery", true);

refreshTokenSchema.index({
  userId: 1,
  role: 1,
  revokedAt: 1,
});

refreshTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports = mongoose.model(
  "RefreshToken",
  refreshTokenSchema
);
