const mongoose = require("mongoose");

const PAYMENT_STATUS = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "cancelled",
];

const PAYMENT_PLANS = [
  "trial",
  "monthly",
  "6month",
  "yearly",
];

const PAYMENT_PROVIDERS = [
  "razorpay",
];

const DEFAULT_META_MAX_BYTES = Number.parseInt(process.env.PAYMENT_META_MAX_BYTES || "16384", 10);
const META_MAX_BYTES =
  Number.isFinite(DEFAULT_META_MAX_BYTES) && DEFAULT_META_MAX_BYTES > 0 ? DEFAULT_META_MAX_BYTES : 16384;

const DEFAULT_WEBHOOK_MAX_BYTES = Number.parseInt(process.env.PAYMENT_WEBHOOK_MAX_BYTES || "65536", 10);
const WEBHOOK_MAX_BYTES =
  Number.isFinite(DEFAULT_WEBHOOK_MAX_BYTES) && DEFAULT_WEBHOOK_MAX_BYTES > 0 ? DEFAULT_WEBHOOK_MAX_BYTES : 65536;

const DEFAULT_RISK_META_MAX_BYTES = Number.parseInt(process.env.PAYMENT_RISK_META_MAX_BYTES || "4096", 10);
const RISK_META_MAX_BYTES =
  Number.isFinite(DEFAULT_RISK_META_MAX_BYTES) && DEFAULT_RISK_META_MAX_BYTES > 0
    ? DEFAULT_RISK_META_MAX_BYTES
    : 4096;

function jsonUtf8ByteLength(value) {
  const json = JSON.stringify(value);
  return Buffer.byteLength(json, "utf8");
}

function isWithinByteLimit(value, maxBytes) {
  if (value == null) return true;
  try {
    return jsonUtf8ByteLength(value) <= maxBytes;
  } catch (_) {
    return false;
  }
}

function isMetaWithinLimit(value) {
  return isWithinByteLimit(value, META_MAX_BYTES);
}

function isWebhookPayloadWithinLimit(value) {
  return isWithinByteLimit(value, WEBHOOK_MAX_BYTES);
}

function isRiskMetaWithinLimit(value) {
  return isWithinByteLimit(value, RISK_META_MAX_BYTES);
}

function isAllowedStatusTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;

  const allowed = {
    pending: new Set(["paid", "failed", "cancelled"]),
    failed: new Set(["paid", "cancelled"]),
    paid: new Set(["refunded"]),
    refunded: new Set([]),
    cancelled: new Set([]),
  };

  return Boolean(allowed[from]?.has(to));
}

function ensureLocals(doc) {
  if (!doc.$locals) doc.$locals = {};
  return doc.$locals;
}

const paymentSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
      immutable: true,
    },

    provider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      default: "razorpay",
      required: true,
      index: true,
      immutable: true,
      trim: true,
      lowercase: true,
    },

    plan: {
      type: String,
      enum: PAYMENT_PLANS,
      required: true,
      immutable: true,
    },

    // Store in paise
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v) => Number.isInteger(v),
        message: "amount must be an integer (paise)",
      },
      immutable: true,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
      immutable: true,
    },

    orderId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      immutable: true,
    },

    paymentId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    signature: {
      type: String,
      default: null,
      select: false,
    },

    status: {
      type: String,
      enum: PAYMENT_STATUS,
      default: "pending",
      index: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    refundId: {
      type: String,
      default: null,
    },

    // Partial refund support (paise)
    refundAmount: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (v) => (v == null ? true : Number.isInteger(v)),
        message: "refundAmount must be an integer (paise)",
      },
    },

    failureReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    refundReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    // Webhook/idempotency support (additive)
    idempotencyKey: { type: String, default: null, trim: true, maxlength: 200 },
    lastWebhookEventId: { type: String, default: null, trim: true, maxlength: 200 },
    webhookReceivedAt: { type: Date, default: null },
    webhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
      validate: {
        validator: isWebhookPayloadWithinLimit,
        message: `webhookPayload exceeds max allowed size (${WEBHOOK_MAX_BYTES} bytes)`,
      },
    },

    // Observability / attempts (bounded, additive)
    attemptCount: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },

    // Optional risk metadata (kept small, additive)
    riskLevel: { type: String, enum: ["low", "medium", "high"], default: null },
    riskMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
      validate: {
        validator: isRiskMetaWithinLimit,
        message: `riskMeta exceeds max allowed size (${RISK_META_MAX_BYTES} bytes)`,
      },
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      validate: {
        validator: isMetaWithinLimit,
        message: `meta exceeds max allowed size (${META_MAX_BYTES} bytes)`,
      },
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: { versionKey: false },
  }
);

paymentSchema.set("strictQuery", true);

// Track snapshot after load / save so transitions + paymentId checks need no extra DB read.
paymentSchema.post("init", function initPaymentLocals(doc) {
  const loc = ensureLocals(doc);
  loc.previousStatus = doc.status;
  loc.previousPaymentId = doc.paymentId ? String(doc.paymentId) : null;
});

paymentSchema.post("save", function refreshPaymentLocals(doc) {
  const loc = ensureLocals(doc);
  loc.previousStatus = doc.status;
  loc.previousPaymentId = doc.paymentId ? String(doc.paymentId) : null;
});

paymentSchema.pre("validate", function validatePaymentLifecycle(next) {
  try {
    const loc = ensureLocals(this);

    // refundAmount vs amount
    if (this.refundAmount != null && this.amount != null && this.refundAmount > this.amount) {
      return next(new Error("refundAmount cannot exceed amount"));
    }

    // paymentId immutability once set (same request/session or after reload via previousPaymentId)
    if (!this.isNew && this.isModified("paymentId")) {
      const prev = loc.previousPaymentId;
      const curr = this.paymentId ? String(this.paymentId) : null;
      if (prev && curr !== prev) {
        return next(new Error("paymentId is immutable once set"));
      }
    }

    // Status transition (no DB round-trip; snapshot from init/post-save)
    if (!this.isNew && this.isModified("status")) {
      const from = loc.previousStatus;
      const to = this.status;
      if (from != null && !isAllowedStatusTransition(from, to)) {
        return next(new Error(`Invalid payment status transition: ${from} -> ${to}`));
      }
    }

    // Consistency by terminal status
    if (this.status === "paid") {
      if (!this.paymentId || String(this.paymentId).trim() === "") {
        return next(new Error("paid status requires paymentId"));
      }
      if (!this.verifiedAt) {
        this.verifiedAt = new Date();
      }
    }

    if (this.status === "refunded") {
      if (!this.refundId || String(this.refundId).trim() === "") {
        return next(new Error("refunded status requires refundId"));
      }
      if (this.refundAmount == null) {
        return next(new Error("refunded status requires refundAmount"));
      }
      if (!this.refundedAt) {
        this.refundedAt = new Date();
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

/**
 * Atomic status transition for concurrency-safe webhook / worker flows.
 * Only updates if current status is one of `fromStatuses` (single-document atomic filter).
 *
 * @returns {mongoose.Document|null} updated doc or null if no match (wrong state / missing id)
 */
paymentSchema.statics.transitionStatusAtomic = async function transitionStatusAtomic(
  filter,
  fromStatuses,
  toStatus,
  extraUpdate = {},
  options = {}
) {
  const allowedFrom = Array.isArray(fromStatuses) ? fromStatuses : [fromStatuses];
  const q = {
    ...filter,
    status: { $in: allowedFrom },
  };
  const now = new Date();
  const set = { ...extraUpdate, status: toStatus };

  if (toStatus === "paid") {
    if (!set.verifiedAt) set.verifiedAt = now;
    if (!set.paymentId) {
      throw new Error("transitionStatusAtomic(paid): paymentId is required in extraUpdate");
    }
  }
  if (toStatus === "refunded") {
    if (!set.refundedAt) set.refundedAt = now;
    if (!set.refundId) {
      throw new Error("transitionStatusAtomic(refunded): refundId is required in extraUpdate");
    }
    if (set.refundAmount == null) {
      throw new Error("transitionStatusAtomic(refunded): refundAmount is required in extraUpdate");
    }
  }

  return this.findOneAndUpdate(q, { $set: set }, { new: true, ...options }).exec();
};

// Query optimization
paymentSchema.index({ libraryId: 1, createdAt: -1 });

paymentSchema.index({
  libraryId: 1,
  status: 1,
  createdAt: -1,
});

paymentSchema.index({ provider: 1, orderId: 1 });

// Webhook lookups
paymentSchema.index({ provider: 1, lastWebhookEventId: 1, webhookReceivedAt: -1 });

// Prevent duplicate webhook replay for the same provider event id (when stored)
paymentSchema.index(
  { provider: 1, lastWebhookEventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      lastWebhookEventId: { $type: "string", $gt: "" },
    },
  }
);

// Safer unique strategy:
// - Allow multiple docs with paymentId: null
// - Enforce uniqueness only once paymentId is set
paymentSchema.index(
  { provider: 1, orderId: 1, paymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentId: { $type: "string" },
    },
  }
);

// Idempotency key should be unique per provider+library if supplied
paymentSchema.index(
  { provider: 1, libraryId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

paymentSchema.statics.PAYMENT_STATUS = PAYMENT_STATUS;
paymentSchema.statics.PAYMENT_PLANS = PAYMENT_PLANS;
paymentSchema.statics.PAYMENT_PROVIDERS = PAYMENT_PROVIDERS;
paymentSchema.statics.isAllowedStatusTransition = isAllowedStatusTransition;

module.exports = mongoose.model(
  "Payment",
  paymentSchema
);
