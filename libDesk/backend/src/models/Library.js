const mongoose = require("mongoose");

/** Paid tier only appears after successful gateway activation (`plan: pro`). */
const PLANS = ["none", "pro"];
const SUBSCRIPTION_STATUS = ["inactive", "active", "cancelled", "expired"];
const CURRENT_PLAN_KEYS = ["none", "trial", "monthly", "6month", "yearly"];

const REGEX = Object.freeze({
  // Pragmatic email validation (avoid over-restricting)
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  // International digits only (no +, spaces, hyphens)
  digitsOnly: /^\d{7,15}$/,
});

function isValidUrl(value) {
  if (value == null || value === "") return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function generateLibraryCodeCandidate(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for readability
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function generateLibraryCode() {
  // No DB access here; rely on unique index + service-layer retry on dup key (E11000).
  return generateLibraryCodeCandidate(8).toUpperCase();
}

function isDupKeyError(error, keyName) {
  if (!error || error.code !== 11000) return false;
  if (!keyName) return true;
  return Boolean(error?.keyPattern?.[keyName] || error?.keyValue?.[keyName]);
}

const librarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    ownerName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 320,
      validate: {
        validator: (v) => REGEX.email.test(String(v || "").trim()),
        message: "Invalid email address",
      },
    },
    passwordHash: { type: String, required: true, select: false },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 15,
      validate: {
        validator: (v) => (v == null || v === "" ? true : REGEX.digitsOnly.test(String(v).trim())),
        message: "Invalid phone number",
      },
    },
    // WhatsApp contact (international digits only, no + or spaces)
    whatsappNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 15,
      validate: {
        validator: (v) => (v == null || v === "" ? true : REGEX.digitsOnly.test(String(v).trim())),
        message: "Invalid whatsappNumber",
      },
    },
    // New communication object (preferred)
    communication: {
      whatsapp: {
        type: String,
        default: null,
        trim: true,
        maxlength: 15,
        validate: {
          validator: (v) => (v == null || v === "" ? true : REGEX.digitsOnly.test(String(v).trim())),
          message: "Invalid communication.whatsapp",
        },
      }, // digits only, international
      channel: {
        type: String,
        default: null,
        trim: true,
        maxlength: 2048,
        validate: {
          validator: isValidUrl,
          message: "Invalid communication.channel URL",
        },
      }, // url
      email: {
        type: String,
        default: null,
        trim: true,
        lowercase: true,
        maxlength: 320,
        validate: {
          validator: (v) => (v == null || v === "" ? true : REGEX.email.test(String(v).trim())),
          message: "Invalid communication.email",
        },
      },
    },
    // Community links (optional)
    communityLinks: {
      whatsappGroup: {
        type: String,
        default: null,
        trim: true,
        maxlength: 2048,
        validate: { validator: isValidUrl, message: "Invalid communityLinks.whatsappGroup URL" },
      },
      whatsappChannel: {
        type: String,
        default: null,
        trim: true,
        maxlength: 2048,
        validate: { validator: isValidUrl, message: "Invalid communityLinks.whatsappChannel URL" },
      },
      telegram: {
        type: String,
        default: null,
        trim: true,
        maxlength: 2048,
        validate: { validator: isValidUrl, message: "Invalid communityLinks.telegram URL" },
      },
    },
    address: { type: String, default: null, trim: true, maxlength: 250 },
    logoUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2048,
      validate: { validator: isValidUrl, message: "Invalid logoUrl URL" },
    },
    // Subscription: `none` until first successful payment; then `pro` while subscribed.
    plan: { type: String, enum: PLANS, default: "none" },
    /**
     * Paid SKU (trial/monthly/...) once activated; `none` before purchase.
     */
    currentPlanKey: { type: String, enum: CURRENT_PLAN_KEYS, default: "none" },
    /**
     * One-time free trial guard:
     * - true: trial already used at least once; never allow free trial again
     */
    trialUsed: { type: Boolean, default: false },
    // status:
    // - inactive: no plan assigned yet (must purchase a plan to activate)
    // - active: normal subscription/trial
    // - cancelled: user cancelled renewal, access remains until expiryDate
    // - expired: expired subscription (features should be restricted)
    subscriptionStatus: { type: String, enum: SUBSCRIPTION_STATUS, default: "inactive" },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null, trim: true, maxlength: 200 },
    cancelNote: { type: String, default: null, trim: true, maxlength: 500 },
    retentionChoice: { type: String, default: null, trim: true, maxlength: 50 }, // accept_discount | continue_cancel
    retentionChoiceAt: { type: Date, default: null },
    planStartDate: { type: Date, default: null },
    planExpiryDate: { type: Date, default: null },
    libraryCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 8,
      immutable: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, strict: true }
);

// Clean serialization for APIs
librarySchema.set("toJSON", {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});
librarySchema.set("toObject", { versionKey: false });
librarySchema.set("strictQuery", true);

// Subscription query performance
librarySchema.index({ subscriptionStatus: 1, planExpiryDate: 1 });
librarySchema.index({ plan: 1, subscriptionStatus: 1 });
librarySchema.index({ currentPlanKey: 1, subscriptionStatus: 1 });
librarySchema.index(
  { subscriptionStatus: 1, planExpiryDate: 1, isActive: 1 },
  { partialFilterExpression: { subscriptionStatus: "active", isActive: true } }
);

librarySchema.pre("validate", async function preValidate(next) {
  try {
    // Subscription date safety
    if (this.planStartDate && this.planExpiryDate && this.planExpiryDate <= this.planStartDate) {
      return next(new Error("planExpiryDate must be after planStartDate"));
    }

    // libraryCode is immutable; only set/normalize on creation.
    // IMPORTANT: avoid DB access during validation for scalability.
    if (this.isNew) {
      if (!this.libraryCode) {
        this.libraryCode = generateLibraryCode();
      } else {
        this.libraryCode = String(this.libraryCode).trim().toUpperCase();
      }
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// Expose enums for reuse (does not affect API behavior)
librarySchema.statics.PLANS = PLANS;
librarySchema.statics.SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS;
librarySchema.statics.CURRENT_PLAN_KEYS = CURRENT_PLAN_KEYS;
librarySchema.statics.isDupKeyError = isDupKeyError;
librarySchema.statics.generateLibraryCode = generateLibraryCode;

// Optional query helper for subscription screens/jobs
librarySchema.statics.findActiveSubscriptionsExpiringBefore = function findActiveSubscriptionsExpiringBefore(date) {
  return this.find({
    isActive: true,
    subscriptionStatus: "active",
    planExpiryDate: { $ne: null, $lte: date },
  });
};

module.exports = mongoose.model("Library", librarySchema);

