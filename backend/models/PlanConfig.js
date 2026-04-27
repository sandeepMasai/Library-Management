const mongoose = require("mongoose");

/**
 * PlanConfig
 *
 * Stores admin-managed pricing & durations for paid plans.
 * Key is unique across the collection.
 */
const PlanConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // monthly | 6month | yearly
    title: { type: String, default: "" },
    price: { type: Number, required: true }, // INR
    durationDays: { type: Number, required: true },
    active: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlanConfig", PlanConfigSchema);

