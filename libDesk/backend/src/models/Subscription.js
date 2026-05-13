const mongoose = require("mongoose");

const SUBSCRIPTION_STATUS = [
  "active",
  "cancelled",
  "expired",
  "pending",
];

const PRICE_MAX = 1e9;

function isSafeMoneyAmount(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (v < 0 || v > PRICE_MAX) return false;
  const normalized = Math.round(v * 100) / 100;
  return Math.abs(v - normalized) < 1e-8;
}

const subscriptionSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      immutable: true,
    },

    plan: {
      type: String,
      enum: ["trial", "monthly", "6month", "yearly"],
      required: true,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        isSafeMoneyAmount,
        "price must be a finite amount between 0 and 1e9 with at most 2 decimal places",
      ],
    },

    /** Optional term length (days) for renewal / reporting; not required for billing APIs. */
    durationDays: {
      type: Number,
      default: undefined,
      min: 1,
      max: 3660,
    },

    startDate: {
      type: Date,
      required: true,
    },

    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: SUBSCRIPTION_STATUS,
      default: "active",
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "pending"],
      default: "paid",
      index: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },

    autoRenew: {
      type: Boolean,
      default: false,
    },

    cancelReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    cancelNote: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    /**
     * Immutable billing snapshot at first persistence (plan/price/duration).
     * Keeps historical invoice context if catalog prices change later.
     */
    purchaseSnapshot: {
      type: new mongoose.Schema(
        {
          plan: { type: String, required: true },
          price: { type: Number, required: true, min: 0 },
          durationDays: { type: Number, min: 1, max: 3660 },
          capturedAt: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },

    /** Prior subscription row this purchase supersedes (renewal chain). */
    previousSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },

    /** Optional successor after renewal (set by future renewal pipeline). */
    replacedBySubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },

    /** Bounded integration metadata (invoices, gateway ids). Omitted from JSON by default transform. */
    billingMeta: {
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
        message: "billingMeta must be a plain object under 8KB serialized",
      },
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.billingMeta;
        return ret;
      },
    },
    toObject: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.billingMeta;
        return ret;
      },
    },
  }
);

subscriptionSchema.set("strictQuery", true);

subscriptionSchema.pre("validate", function (next) {
  if (this.startDate && this.expiryDate && this.expiryDate <= this.startDate) {
    this.invalidate("expiryDate", "expiryDate must be after startDate");
  }

  if (this.status === "cancelled" && !this.cancelledAt) {
    this.set("cancelledAt", new Date());
  }

  if (this.isNew && !this.purchaseSnapshot?.plan) {
    const snap = {
      plan: this.plan,
      price: this.price,
      capturedAt: new Date(),
    };
    if (this.durationDays != null) snap.durationDays = this.durationDays;
    this.set("purchaseSnapshot", snap);
  }

  next();
});

/**
 * - At most one active row per tenant (partial unique index); expire prior actives on new active.
 * - Auto-expire active/pending rows past expiryDate (cancelled rows stay cancelled for history).
 * - Cancellation hygiene: turn off autoRenew when cancelled.
 */
subscriptionSchema.pre("save", async function () {
  if (this.isNew && this.status === "active") {
    const excludeId = this._id ? { _id: { $ne: this._id } } : {};
    const prevActive = await this.constructor
      .findOne({
        libraryId: this.libraryId,
        status: "active",
        ...excludeId,
      })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();
    if (prevActive?._id) {
      this.set("previousSubscriptionId", prevActive._id);
    }
    await this.constructor.updateMany(
      {
        libraryId: this.libraryId,
        status: "active",
        ...excludeId,
      },
      { $set: { status: "expired" } }
    );
  }

  if (
    this.expiryDate &&
    new Date(this.expiryDate).getTime() < Date.now() &&
    (this.status === "active" || this.status === "pending")
  ) {
    this.set("status", "expired");
  }

  if (this.status === "cancelled") {
    this.set("autoRenew", false);
  }
});

/** Link renewal chain on the superseded row (best-effort, idempotent). */
subscriptionSchema.post("save", async function (doc) {
  if (!doc?.previousSubscriptionId || !doc?._id) return;
  try {
    await doc.constructor.collection.updateOne(
      { _id: doc.previousSubscriptionId },
      { $set: { replacedBySubscriptionId: doc._id } }
    );
  } catch {
    /* ignore */
  }
});

/** At most one active subscription document per library (MongoDB partial unique index). */
subscriptionSchema.index(
  { libraryId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

subscriptionSchema.index({
  libraryId: 1,
  createdAt: -1,
});

subscriptionSchema.index({
  libraryId: 1,
  expiryDate: -1,
});

subscriptionSchema.index({
  libraryId: 1,
  status: 1,
  expiryDate: 1,
});

subscriptionSchema.index({
  libraryId: 1,
  status: 1,
  paymentStatus: 1,
});

/** Cron / job: mark active rows past expiry as expired (cancelled history preserved). */
subscriptionSchema.statics.syncExpiredFromDates = async function syncExpiredFromDates(
  filter = {}
) {
  const now = new Date();
  const res = await this.updateMany(
    {
      ...filter,
      status: { $in: ["active", "pending"] },
      expiryDate: { $lt: now },
    },
    { $set: { status: "expired" } }
  );
  return { modifiedCount: res.modifiedCount };
};

/** Reusable filter: tenant subscription history (all statuses). */
subscriptionSchema.statics.filterLibraryHistory = function filterLibraryHistory(
  libraryId
) {
  return { libraryId };
};

/**
 * Current billable period row (active and not past expiry instant).
 * Use for middleware-style checks against Subscription collection.
 */
subscriptionSchema.statics.filterCurrentlyActive = function filterCurrentlyActive(
  libraryId
) {
  return {
    libraryId,
    status: "active",
    expiryDate: { $gte: new Date() },
  };
};

/**
 * Repair helper if a partial-unique index build fails due to legacy duplicate actives.
 * Keeps the newest active row per libraryId and expires the rest.
 */
subscriptionSchema.statics.resolveDuplicateActiveSubscriptions =
  async function resolveDuplicateActiveSubscriptions() {
    const dupes = await this.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: "$libraryId",
          ids: { $push: "$_id" },
          created: { $push: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let expiredExtra = 0;
    for (const row of dupes) {
      const pairs = row.ids.map((id, i) => ({
        id,
        createdAt: row.created[i],
      }));
      pairs.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const [, ...rest] = pairs;
      if (!rest.length) continue;
      const res = await this.updateMany(
        { _id: { $in: rest.map((p) => p.id) } },
        { $set: { status: "expired" } }
      );
      expiredExtra += res.modifiedCount;
    }
    return { librariesWithDupes: dupes.length, expiredExtra };
  };

module.exports = mongoose.model(
  "Subscription",
  subscriptionSchema
);
