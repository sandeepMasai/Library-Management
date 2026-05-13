const mongoose = require("mongoose");

const PLAN_KEYS = [
  "monthly",
  "6month",
  "yearly",
];

const PlanConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      lowercase: true,
      enum: PLAN_KEYS,
    },

    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },

    // Canonical paise
    pricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "pricePaise must be integer",
      },
    },

    // API compatibility
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    durationDays: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "durationDays must be integer",
      },
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    displayOrder: {
      type: Number,
      default: 0,
    },

    tag: {
      type: String,
      default: null,
      trim: true,
      maxlength: 40,
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: { versionKey: false },
  }
);

PlanConfigSchema.set("strictQuery", true);

PlanConfigSchema.pre("validate", function (next) {
  this.pricePaise = Math.round(Number(this.price || 0) * 100);
  next();
});

module.exports = mongoose.model(
  "PlanConfig",
  PlanConfigSchema
);