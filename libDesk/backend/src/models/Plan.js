const mongoose = require("mongoose");

/**
 * Plans (admin-managed)
 *
 * Storage:
 * - `price` / `finalPrice`: INR (rupees), kept for API compatibility (same scale as before).
 * - `pricePaise` / `finalPricePaise`: integer paise — canonical for billing math (no float drift).
 *
 * finalPrice(INR) = finalPricePaise / 100
 * Computed only in pre("validate"); client-supplied finalPrice / *_Paise are overwritten.
 */

const PLAN_KEY_PATTERN = /^[a-z0-9_-]{1,40}$/;

/** Discount % stored with max 4 decimal places (avoids float noise). */
const DISCOUNT_DECIMALS = 4;

const DEFAULT_FEATURES_MAX_BYTES = Number.parseInt(process.env.PLAN_FEATURES_MAX_BYTES || "8192", 10);
const FEATURES_MAX_BYTES =
  Number.isFinite(DEFAULT_FEATURES_MAX_BYTES) && DEFAULT_FEATURES_MAX_BYTES > 0
    ? DEFAULT_FEATURES_MAX_BYTES
    : 8192;

function rupeesToPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function paiseToRupees2(paise) {
  const p = Math.max(0, Math.trunc(Number(paise)));
  return Math.round(p) / 100;
}

function normalizeDiscountPercent(raw) {
  const n = Number(raw || 0);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(100, Math.max(0, n));
  const factor = 10 ** DISCOUNT_DECIMALS;
  return Math.round(clamped * factor) / factor;
}

function isFeaturesWithinLimit(value) {
  if (value == null) return true;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= FEATURES_MAX_BYTES;
  } catch (_) {
    return false;
  }
}

const PlanSchema = new mongoose.Schema(
  {
    /** Increments when plan billing semantics change (migration / API compatibility). */
    planSchemaVersion: { type: Number, default: 1, min: 1, index: true },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
      immutable: true,
      validate: {
        validator: (v) => PLAN_KEY_PATTERN.test(String(v || "")),
        message: "Invalid plan key",
      },
    },
    /** INR (rupees); min 0 */
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v) => Number.isFinite(v),
        message: "price must be a finite number",
      },
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      validate: {
        validator: (v) => Number.isFinite(v),
        message: "discount must be a finite number",
      },
    }, // %
    /** INR (rupees) — always recomputed in pre-validate from price/discount */
    finalPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    /** Integer paise — derived from `price`; set in pre-validate */
    pricePaise: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (v) => v == null || (Number.isInteger(v) && v >= 0),
        message: "pricePaise must be a non-negative integer",
      },
    },
    /** Integer paise — canonical discounted amount; set in pre-validate */
    finalPricePaise: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (v) => v == null || (Number.isInteger(v) && v >= 0),
        message: "finalPricePaise must be a non-negative integer",
      },
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function durationValidator(v) {
          if (!Number.isInteger(v) || v < 0) return false;
          return v >= 1;
        },
        message: "duration must be an integer (days); paid plans require at least 1",
      },
    },
    isTrial: { type: Boolean, default: false },
    /**
     * If true, show this plan only for brand new libraries (trialUsed=false).
     * Used for the ₹99 trial plan.
     */
    showOnlyForNew: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    tag: { type: String, default: null, trim: true, maxlength: 40 },

    /**
     * Optional feature flags / limits for future SaaS packaging (additive).
     * Keep small; validated by size limit.
     */
    features: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      validate: {
        validator: isFeaturesWithinLimit,
        message: `features JSON exceeds max allowed size (${FEATURES_MAX_BYTES} bytes)`,
      },
    },
  },
  { timestamps: true, strict: true }
);

PlanSchema.set("strictQuery", true);

PlanSchema.set("toJSON", {
  versionKey: false,
});

PlanSchema.pre("validate", function planPreValidate(next) {
  try {
    if (this.showOnlyForNew && !this.isTrial) {
      return next(new Error("showOnlyForNew requires isTrial"));
    }

    if (this.isTrial && Number(this.duration || 0) < 1) {
      return next(new Error("Trial plans require duration of at least 1 day"));
    }

    const discount = normalizeDiscountPercent(this.discount);
    this.discount = discount;

    const pricePaise = rupeesToPaise(this.price);
    this.pricePaise = pricePaise;

    const discountedPaise = Math.floor((pricePaise * (100 - discount)) / 100);
    const finalPaise = Math.max(0, discountedPaise);

    this.finalPricePaise = finalPaise;
    this.finalPrice = paiseToRupees2(finalPaise);

    return next();
  } catch (err) {
    return next(err);
  }
});

/**
 * Recompute canonical pricing (same math as pre-validate). Use in services/tests.
 */
PlanSchema.statics.computePricingFromPriceAndDiscount = function computePricingFromPriceAndDiscount(
  priceRupees,
  discountPercent
) {
  const discount = normalizeDiscountPercent(discountPercent);
  const pricePaise = rupeesToPaise(priceRupees);
  const discountedPaise = Math.floor((pricePaise * (100 - discount)) / 100);
  const finalPaise = Math.max(0, discountedPaise);
  return {
    discount,
    pricePaise,
    finalPricePaise: finalPaise,
    finalPriceRupees: paiseToRupees2(finalPaise),
  };
};

// Listing active plans by billing queries
PlanSchema.index({ isActive: 1, key: 1 });

PlanSchema.statics.PLAN_KEY_PATTERN = PLAN_KEY_PATTERN;
PlanSchema.statics.DISCOUNT_DECIMALS = DISCOUNT_DECIMALS;

module.exports = mongoose.model("Plan", PlanSchema);
