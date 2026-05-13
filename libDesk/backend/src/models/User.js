const mongoose = require("mongoose");
const { verifyBcryptPassword } = require("../utils/authCredentials");

/**
 * Central auth identity for SaaS RBAC and audit correlation.
 * JWT `userId` / refresh tokens use the same string as `subjectKey` for continuity:
 * - Platform admin: "admin-1"
 * - Library account: Library document id (hex string)
 * - Student: Student document id (hex string)
 *
 * Credentials remain on Library / Student collections until a future migration;
 * this model tracks identity, permissions, activity, and optional mirrored fields.
 */

const USER_ROLES = [
  "admin",
  "library",
  "student",
  "staff",
];

/** Aligns with role; normalized in pre("validate"). */
const AUTH_SOURCES = [
  "platform",
  "library",
  "student",
  "staff",
  "user",
];

const ACCOUNT_STATUSES = [
  "provisioning",
  "active",
  "suspended",
  "deactivated",
];

const SUBJECT_KEY_PATTERN = /^[\w.-]{1,128}$/;

const MAX_SECURITY_EVENTS = 40;

const verificationSubSchema = new mongoose.Schema(
  {
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const securitySubSchema = new mongoose.Schema(
  {
    failedLoginAttempts: { type: Number, default: 0, min: 0, max: 1_000_000 },
    lockoutUntil: { type: Date, default: null },
    lastFailedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    mfaEnabled: { type: Boolean, default: false },
    mfaPending: { type: Boolean, default: false },
    mfaMethods: {
      type: [String],
      default: [],
      validate: {
        validator(arr) {
          return (arr || []).every(
            (x) => typeof x === "string" && x.length > 0 && x.length <= 32
          );
        },
        message: "mfaMethods must be non-empty short strings",
      },
    },
    /** Bump when invalidating refresh tokens / forcing re-login (optional JWT claim later). */
    tokenVersion: { type: Number, default: 0, min: 0 },
    /** Reject refresh/session material issued before this instant (pair with token `iat`). */
    sessionsInvalidBefore: { type: Date, default: null },
    /** Device/session extensibility: stable device ids, push tokens metadata (bounded). */
    deviceMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator(v) {
          if (v == null) return true;
          if (typeof v !== "object" || Array.isArray(v)) return false;
          try {
            return JSON.stringify(v).length <= 4096;
          } catch {
            return false;
          }
        },
        message: "deviceMeta must be a plain object under 4KB serialized",
      },
    },
    /**
     * Ring buffer of recent security-relevant events (codes only; keep payloads small).
     */
    securityEvents: {
      type: [
        {
          code: { type: String, required: true, maxlength: 64 },
          at: { type: Date, default: Date.now },
          meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
        },
      ],
      default: undefined,
      validate: {
        validator(arr) {
          return !arr || arr.length <= MAX_SECURITY_EVENTS;
        },
        message: `securityEvents may contain at most ${MAX_SECURITY_EVENTS} entries`,
      },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    /**
     * Stable subject id aligned with issued JWT userId (never change once issued).
     */
    subjectKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      immutable: true,
      match: [SUBJECT_KEY_PATTERN, "Invalid subjectKey format"],
    },

    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      index: true,
    },

    /**
     * Enterprise lifecycle (isActive remains the fast boolean gate for auth middleware).
     */
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "active",
      index: true,
    },

    /**
     * Optimistic concurrency / migration checkpoints (optional gate on critical writes).
     */
    schemaVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 320,
      sparse: true,
    },

    mobile: {
      type: String,
      default: null,
      trim: true,
      maxlength: 15,
      sparse: true,
    },

    /** Reserved for migrated or mirrored passwords; Library.passwordHash remains canonical for library login today. */
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },

    /**
     * Fine-grained RBAC tags (e.g. library.billing.read). Staff/sub-admin ready.
     */
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator(arr) {
          return (arr || []).every(
            (p) =>
              typeof p === "string" &&
              p.length <= 96 &&
              /^[a-z][a-z0-9_.*@-]*$/i.test(p)
          );
        },
        message: "permissions must be scoped identifier tokens",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      default: null,
      index: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
      index: true,
    },

    authSource: {
      type: String,
      enum: AUTH_SOURCES,
      default: "user",
    },

    /** Email/phone verification (future workflows); omitted from default JSON. */
    verification: {
      type: verificationSubSchema,
      default: undefined,
      select: false,
    },

    /** Credential / lockout / MFA preparation (omit from default serialization). */
    security: {
      type: securitySubSchema,
      default: undefined,
      select: false,
    },

    /** Optional enterprise metadata; stripped from default JSON. */
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
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        delete ret.auditMeta;
        delete ret.security;
        delete ret.verification;
        return ret;
      },
    },
    toObject: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        delete ret.auditMeta;
        delete ret.security;
        delete ret.verification;
        return ret;
      },
    },
  }
);

userSchema.set("strictQuery", true);

function oidLikeEqual(subjectKey, oid) {
  if (!oid || !subjectKey) return false;
  try {
    return String(subjectKey).trim() === String(oid);
  } catch {
    return false;
  }
}

function normalizeAuthSourceForRole(role) {
  if (role === "admin") return "platform";
  if (role === "library") return "library";
  if (role === "student") return "student";
  if (role === "staff") return "staff";
  return "user";
}

userSchema.pre("validate", function (next) {
  if (
    this.accountStatus === "suspended" ||
    this.accountStatus === "deactivated"
  ) {
    this.isActive = false;
  }

  if (!SUBJECT_KEY_PATTERN.test(String(this.subjectKey || ""))) {
    this.invalidate("subjectKey", "subjectKey has invalid format");
  }

  const role = this.role;
  const expected = normalizeAuthSourceForRole(role);
  if (this.get("authSource") !== expected) {
    this.set("authSource", expected);
  }

  if (role === "admin") {
    if (this.libraryId != null) {
      this.invalidate("libraryId", "admin identities must not have libraryId");
    }
    if (this.studentId != null) {
      this.invalidate("studentId", "admin identities must not have studentId");
    }
  }

  if (role === "library") {
    if (!this.libraryId) {
      this.invalidate("libraryId", "library role requires libraryId");
    }
    if (this.studentId != null) {
      this.invalidate("studentId", "library role must not set studentId");
    }
    if (this.libraryId && !oidLikeEqual(this.subjectKey, this.libraryId)) {
      this.invalidate(
        "subjectKey",
        "subjectKey must equal libraryId for library role"
      );
    }
  }

  if (role === "student") {
    if (!this.libraryId) {
      this.invalidate("libraryId", "student role requires tenant libraryId");
    }
    if (!this.studentId) {
      this.invalidate("studentId", "student role requires studentId");
    }
    if (this.studentId && !oidLikeEqual(this.subjectKey, this.studentId)) {
      this.invalidate(
        "subjectKey",
        "subjectKey must equal studentId for student role"
      );
    }
  }

  if (role === "staff") {
    if (!this.libraryId) {
      this.invalidate(
        "libraryId",
        "staff role requires tenant libraryId"
      );
    }
    if (this.studentId != null) {
      this.invalidate("studentId", "staff role must not set studentId");
    }
  }

  next();
});

/** Normalize authSource on persisted writes (validateSync alone may not run all hooks). */
userSchema.pre("save", function (next) {
  const expected = normalizeAuthSourceForRole(this.role);
  if (this.get("authSource") !== expected) {
    this.set("authSource", expected);
  }
  if (
    this.isModified("accountStatus") &&
    (this.accountStatus === "suspended" ||
      this.accountStatus === "deactivated")
  ) {
    this.isActive = false;
  }
  next();
});

/**
 * Verify password when credentials are mirrored onto User (migration / future login via User).
 * Avoids extra query when passwordHash is already on the document.
 */
userSchema.methods.verifyPassword = async function verifyPassword(plain) {
  let hash = this.passwordHash;
  if (!hash && this._id) {
    hash = await this.constructor
      .findOne({ _id: this._id })
      .select("+passwordHash")
      .lean()
      .then((d) => d?.passwordHash);
  }
  return verifyBcryptPassword(plain, hash);
};

/** Whether login should be denied due to lifecycle or lockout (optional gate before bcrypt/PIN). */
userSchema.methods.isLoginBlocked = function isLoginBlocked(now = new Date()) {
  if (!this.isActive) return true;
  if (this.accountStatus && this.accountStatus !== "active") return true;
  const until = this.security?.lockoutUntil;
  if (until && new Date(until).getTime() > now.getTime()) return true;
  return false;
};

/**
 * Atomic failed-attempt + lockout (single round-trip, concurrency-safe counter).
 * Requires MongoDB 4.2+ aggregation pipelines in updates.
 */
userSchema.methods.recordFailedCredentialAttempt = async function recordFailedCredentialAttempt(
  options = {}
) {
  const maxAttempts = Number(options.maxAttempts) || 10;
  const lockMinutes = Number(options.lockMinutes) || 15;
  const id = this._id;

  try {
    await this.constructor.collection.updateOne({ _id: id }, [
      {
        $set: {
          _attemptCount: {
            $add: [{ $ifNull: ["$security.failedLoginAttempts", 0] }, 1],
          },
        },
      },
      {
        $set: {
          security: {
            $mergeObjects: [
              { $ifNull: ["$security", {}] },
              {
                failedLoginAttempts: "$_attemptCount",
                lastFailedAt: "$$NOW",
                lockoutUntil: {
                  $cond: [
                    { $gte: ["$_attemptCount", maxAttempts] },
                    {
                      $dateAdd: {
                        startDate: "$$NOW",
                        unit: "minute",
                        amount: lockMinutes,
                      },
                    },
                    { $ifNull: ["$security.lockoutUntil", null] },
                  ],
                },
              },
            ],
          },
        },
      },
      { $unset: "_attemptCount" },
    ]);
  } catch (_e) {
    await this.constructor.updateOne(
      { _id: id },
      {
        $inc: { "security.failedLoginAttempts": 1 },
        $set: { "security.lastFailedAt": new Date() },
      }
    );
    const fresh = await this.constructor.findById(id).select("security").lean();
    const n = fresh?.security?.failedLoginAttempts || 0;
    if (n >= maxAttempts) {
      await this.constructor.updateOne(
        { _id: id },
        {
          $set: {
            "security.lockoutUntil": new Date(
              Date.now() + lockMinutes * 60 * 1000
            ),
          },
        }
      );
    }
  }

  await this.constructor.updateOne(
    { _id: id },
    {
      $push: {
        "security.securityEvents": {
          $each: [
            {
              code: "credential_failure",
              at: new Date(),
              meta: { path: "User.recordFailedCredentialAttempt" },
            },
          ],
          $slice: -MAX_SECURITY_EVENTS,
        },
      },
    }
  );
};

userSchema.methods.clearCredentialLockout = async function clearCredentialLockout() {
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        "security.failedLoginAttempts": 0,
        "security.lockoutUntil": null,
        "security.lastSuccessAt": new Date(),
      },
      $inc: { schemaVersion: 1 },
    }
  );
};

/**
 * Invalidate refresh/session continuity for this identity (pair with RefreshToken checks).
 */
userSchema.methods.revokeAllSessions = async function revokeAllSessions(
  reason = "admin_revoke"
) {
  const now = new Date();
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        "security.sessionsInvalidBefore": now,
      },
      $inc: {
        "security.tokenVersion": 1,
        schemaVersion: 1,
      },
      $push: {
        "security.securityEvents": {
          $each: [{ code: "sessions_revoked", at: now, meta: { reason } }],
          $slice: -MAX_SECURITY_EVENTS,
        },
      },
    }
  );
};

/** Optional: embed tokenVersion / sessionsInvalidBefore into JWT when you evolve token utils. */
userSchema.methods.getSessionPolicy = function getSessionPolicy() {
  return {
    tokenVersion: this.security?.tokenVersion ?? 0,
    sessionsInvalidBefore: this.security?.sessionsInvalidBefore ?? null,
  };
};

userSchema.statics.USER_ROLES = USER_ROLES;
userSchema.statics.AUTH_SOURCES = AUTH_SOURCES;
userSchema.statics.ACCOUNT_STATUSES = ACCOUNT_STATUSES;

userSchema.index({ libraryId: 1, role: 1, isActive: 1 });

userSchema.index({ libraryId: 1, role: 1, accountStatus: 1 });

userSchema.index({ role: 1, subjectKey: 1 });

userSchema.index({ permissions: 1 });

userSchema.index(
  { libraryId: 1, role: 1 },
  {
    partialFilterExpression: {
      isActive: true,
      accountStatus: "active",
    },
  }
);

userSchema.index(
  { email: 1, libraryId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: "library",
      email: { $exists: true, $nin: [null, ""] },
    },
  }
);

userSchema.index(
  { mobile: 1, libraryId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: "student",
      mobile: { $exists: true, $nin: [null, ""] },
    },
  }
);

module.exports = mongoose.model("User", userSchema);
