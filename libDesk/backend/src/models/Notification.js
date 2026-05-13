const mongoose = require("mongoose");

const NOTIFICATION_CATEGORIES = [
  "general",
  "festival",
  "closure",
  "hours",
  "rules",
  "event",
];

const PRIORITY_LEVELS = [
  "low",
  "normal",
  "high",
  "urgent",
];

const TARGET_TYPES = ["all", "student", "library"];

const notificationSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    date: {
      type: Date,
      required: true,
    },

    targetType: {
      type: String,
      enum: TARGET_TYPES,
      default: "all",
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
      default: "general",
      trim: true,
    },

    priority: {
      type: String,
      enum: PRIORITY_LEVELS,
      default: "normal",
      index: true,
    },

    /**
     * Backward-compatible global read state.
     * NOTE: For multi-user read tracking, use `readReceipts` (additive).
     */
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    /**
     * Scalable per-user read tracking (additive; does not change existing behavior).
     * Each receipt represents one user reading this notification.
     *
     * IMPORTANT (scalability):
     * - This array is intentionally bounded to avoid unbounded document growth.
     * - For true multi-user systems, migrate read receipts to a separate collection.
     */
    readReceipts: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, default: null },
        role: { type: String, enum: ["admin", "library", "student"], default: null },
        readAt: { type: Date, default: Date.now },
      },
    ],

    /**
     * Optional expiry for scheduled cleanup (additive).
     * If set, TTL index on `expiresAt` will remove the document at that time.
     */
    expiresAt: { type: Date, default: null },

    // Optional sender/audit context (additive)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Library", default: null, index: true },
    senderLabel: { type: String, default: null, trim: true, maxlength: 120 },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: { versionKey: false },
  }
);

const DEFAULT_MAX_READ_RECEIPTS = Number.parseInt(process.env.NOTIFICATION_MAX_READ_RECEIPTS || "200", 10);
const MAX_READ_RECEIPTS =
  Number.isFinite(DEFAULT_MAX_READ_RECEIPTS) && DEFAULT_MAX_READ_RECEIPTS > 0 ? DEFAULT_MAX_READ_RECEIPTS : 200;

// Optional expiry-based cleanup (when expiresAt is set)
notificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: "date" } } }
);

// Query optimization
notificationSchema.index({
  libraryId: 1,
  createdAt: -1,
});

notificationSchema.index({
  libraryId: 1,
  targetType: 1,
  createdAt: -1,
});

// Future unread/priority queries (additive)
notificationSchema.index({ libraryId: 1, isRead: 1, priority: 1, createdAt: -1 });

/**
 * Whether this lean/document has a read receipt for the given user id string.
 * (Used for API shaping + unread queries; avoids relying on instance methods for .lean().)
 */
notificationSchema.statics.hasReadReceipt = function hasReadReceipt(doc, userId) {
  if (!doc || userId == null || userId === "") return false;
  const uid = String(userId);
  const receipts = doc.readReceipts;
  if (!Array.isArray(receipts) || !receipts.length) return false;
  return receipts.some((r) => r && r.userId != null && String(r.userId) === uid);
};

notificationSchema.methods.isReadByUser = function isReadByUser(userId) {
  return this.constructor.hasReadReceipt(this, userId);
};

/**
 * Mongo filter fragment: notification not yet read by this user (no matching receipt).
 * Combine with $and alongside tenant / targeting filters.
 */
notificationSchema.statics.unreadReceiptFilter = function unreadReceiptFilter(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    return {};
  }
  const oid = new mongoose.Types.ObjectId(String(userId));
  return {
    readReceipts: { $not: { $elemMatch: { userId: oid } } },
  };
};

notificationSchema.pre("validate", function (next) {
  // Keep global read flags internally consistent (backward compatibility).
  if (this.readAt && !this.isRead) this.isRead = true;
  if (this.isRead && !this.readAt) this.readAt = new Date();

  if (this.targetType === "student" && !this.targetId) {
    return next(
      new Error("targetId is required for student notifications")
    );
  }

  if (this.targetType !== "student") {
    this.targetId = null;
  }

  // Protect against unbounded document growth.
  if (Array.isArray(this.readReceipts) && this.readReceipts.length > MAX_READ_RECEIPTS) {
    return next(new Error(`readReceipts exceeds max allowed (${MAX_READ_RECEIPTS})`));
  }

  next();
});

// Expose enums for reuse (does not affect API behavior)
notificationSchema.statics.CATEGORIES = NOTIFICATION_CATEGORIES;
notificationSchema.statics.PRIORITY_LEVELS = PRIORITY_LEVELS;
notificationSchema.statics.TARGET_TYPES = TARGET_TYPES;

module.exports = mongoose.model(
  "Notification",
  notificationSchema
);