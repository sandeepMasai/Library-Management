const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const FEE_STATUS = [
  "paid",
  "partial",
  "pending",
];

/**
 * Username: 2–40 chars, lowercase.
 * Either plain alphanumerics, or 3+ chars with optional interior . _ -
 * (no leading/trailing separator).
 */
const USERNAME_PATTERN =
  /^([a-z0-9]{2,40}|[a-z0-9](?:[a-z0-9._-]){1,38}[a-z0-9])$/;

const FEE_AMOUNT_MAX = 1e9;

function isSafeMoneyAmount(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (v < 0 || v > FEE_AMOUNT_MAX) return false;
  const normalized = Math.round(v * 100) / 100;
  return Math.abs(v - normalized) < 1e-8;
}

function isValidPhotoUrl(s) {
  if (s == null || s === "") return true;
  if (typeof s !== "string" || s.length > 2048) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Aligns with list/dashboard semantics: active while expiryDate >= now (instant),
 * unless blocked or soft-deleted (treated as non-active for lifecycle).
 */
function deriveMembershipStatus(doc) {
  if (!doc) return "active";
  if (doc.isDeleted) return "expired";
  if (Boolean(doc.isBlocked)) return "blocked";
  if (!doc.expiryDate) return "active";
  return new Date(doc.expiryDate).getTime() >= Date.now() ? "active" : "expired";
}

const studentSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
      immutable: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },

    mobile: {
      type: String,
      required: true,
      trim: true,
      match: /^[0-9]{10}$/,
    },

    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 40,
      match: [USERNAME_PATTERN, "Invalid username format"],
    },

    pinHash: {
      type: String,
      required: true,
      select: false,
    },

    joinDate: {
      type: Date,
      required: true,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    /**
     * Monetary amount in major currency units (e.g. rupees).
     * Validated to 2 decimal places at most to avoid float drift in billing.
     */
    feeAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        isSafeMoneyAmount,
        "feeAmount must be a finite amount between 0 and 1e9 with at most 2 decimal places",
      ],
    },

    feeStatus: {
      type: String,
      enum: FEE_STATUS,
      required: true,
      index: true,
    },

    feeMethod: {
      type: String,
      enum: ["cash", "upi"],
      default: "cash",
    },

    /**
     * Derived from isBlocked + calendar expiry (UTC day) on save / after findOneAndUpdate.
     * Keeps tenant reporting and lifecycle jobs aligned without breaking isBlocked checks.
     */
    membershipStatus: {
      type: String,
      enum: ["active", "expired", "blocked"],
      default: "active",
    },

    /** Operational access gate (login, attendance). Kept as the source for "blocked". */
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    photoUrl: {
      type: String,
      default: null,
      validate: [isValidPhotoUrl, "photoUrl must be null, empty, or an http(s) URL"],
    },

    /** Optional tenant audit / integration tags (bounded size). Stripped in toJSON/toObject. */
    auditMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator(v) {
          if (v == null) return true;
          if (typeof v !== "object" || Array.isArray(v)) return false;
          try {
            return JSON.stringify(v).length <= 8192;
          } catch {
            return false;
          }
        },
        message: "auditMeta must be a plain object under 8KB serialized",
      },
    },

    /**
     * Reserved for future auth hardening (last verify, IP digest, lockout counters).
     * select:false — omit from default queries; load with .select("+loginSecurityMeta") when needed.
     */
    loginSecurityMeta: {
      type: new mongoose.Schema(
        {
          lastSuccessfulPinVerifyAt: { type: Date },
          lastFailedPinVerifyAt: { type: Date },
          consecutivePinFailures: { type: Number, min: 0, max: 1_000_000 },
          lastSeenIpDigest: { type: String, maxlength: 128 },
        },
        { _id: false }
      ),
      default: undefined,
      select: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      default: null,
      immutable: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.pinHash;
        delete ret.__v;
        delete ret.auditMeta;
        delete ret.loginSecurityMeta;
        return ret;
      },
    },
    toObject: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.pinHash;
        delete ret.__v;
        delete ret.auditMeta;
        delete ret.loginSecurityMeta;
        return ret;
      },
    },
  }
);

studentSchema.set("strictQuery", true);

studentSchema.pre("validate", function (next) {
  if (this.joinDate && this.expiryDate) {
    const j = new Date(this.joinDate).getTime();
    const e = new Date(this.expiryDate).getTime();
    if (e < j) {
      this.invalidate(
        "expiryDate",
        "expiryDate must be greater than or equal to joinDate"
      );
    }
  }
  next();
});

studentSchema.pre("save", function (next) {
  const nextStatus = deriveMembershipStatus(this);
  if (this.membershipStatus !== nextStatus) {
    this.set("membershipStatus", nextStatus);
  }
  next();
});

/**
 * findOneAndUpdate bypasses document `save` middleware — align membership after writes.
 * Uses native collection update to avoid recursive query middleware.
 */
studentSchema.post("findOneAndUpdate", async function (doc) {
  if (!doc || !doc._id) return;
  try {
    const nextStatus = deriveMembershipStatus(doc);
    if (doc.membershipStatus === nextStatus) return;
    await this.model.collection.updateOne(
      { _id: doc._id },
      { $set: { membershipStatus: nextStatus } }
    );
    doc.set("membershipStatus", nextStatus);
  } catch {
    /* avoid failing the primary operation; cron / next read can reconcile */
  }
});

studentSchema.index(
  { libraryId: 1, username: 1 },
  { unique: true }
);

studentSchema.index(
  { libraryId: 1, mobile: 1 },
  { unique: true }
);

/** Tenant student list (newest first). */
studentSchema.index({ libraryId: 1, isDeleted: 1, createdAt: -1 });

/** Fee / collections style filters per library. */
studentSchema.index({ libraryId: 1, isDeleted: 1, feeStatus: 1 });

/** Lifecycle: expiry sweeps, renewal reminders, active-seat style queries. */
studentSchema.index({
  libraryId: 1,
  isDeleted: 1,
  membershipStatus: 1,
  expiryDate: 1,
});

/** Partial index: eligible members by expiry window (large SaaS collections). */
studentSchema.index(
  { libraryId: 1, expiryDate: 1 },
  {
    partialFilterExpression: {
      isDeleted: false,
      isBlocked: false,
    },
  }
);

/**
 * Bulk-align membershipStatus with dates + isBlocked (e.g. node-cron nightly).
 * Does not change isBlocked; only active/expired vs blocked coherence.
 */
/** Reusable tenant scope (not deleted). Use in queries for consistency. */
studentSchema.statics.filterTenantNotDeleted = function filterTenantNotDeleted(
  libraryId
) {
  return { libraryId, isDeleted: false };
};

/**
 * Students treated as “active membership” for capacity / attendance style checks
 * (not deleted, not blocked, not past expiry instant).
 */
studentSchema.statics.filterActiveMembership = function filterActiveMembership(
  libraryId
) {
  return {
    libraryId,
    isDeleted: false,
    isBlocked: false,
    expiryDate: { $gte: new Date() },
  };
};

studentSchema.statics.syncMembershipStatuses = async function (filter = {}) {
  const base = { isDeleted: false, ...filter };
  const now = new Date();

  const blockedRes = await this.updateMany(
    { ...base, isBlocked: true, membershipStatus: { $ne: "blocked" } },
    { $set: { membershipStatus: "blocked" } }
  );

  const expiredRes = await this.updateMany(
    {
      ...base,
      isBlocked: false,
      expiryDate: { $lt: now },
      membershipStatus: { $ne: "expired" },
    },
    { $set: { membershipStatus: "expired" } }
  );

  const activeRes = await this.updateMany(
    {
      ...base,
      isBlocked: false,
      expiryDate: { $gte: now },
      membershipStatus: { $ne: "active" },
    },
    { $set: { membershipStatus: "active" } }
  );

  return {
    blockedModified: blockedRes.modifiedCount,
    expiredModified: expiredRes.modifiedCount,
    activeModified: activeRes.modifiedCount,
  };
};

/**
 * PIN check in one round-trip when the document was loaded with `.select("+pinHash")`
 * (see auth.service student login). No extra query on the hot path.
 */
studentSchema.methods.verifyPin = async function (pin) {
  const plain = String(pin || "").trim();
  const hash = this.pinHash;
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
};

module.exports = mongoose.model(
  "Student",
  studentSchema
);
