const mongoose = require("mongoose");

/**
 * Plans (admin-managed)
 *
 * finalPrice = price - (price * discount / 100)
 */
const PlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Monthly", "Yearly"
    key: { type: String, required: true, unique: true, index: true }, // monthly | 6month | yearly | free
    price: { type: Number, required: true }, // INR
    discount: { type: Number, default: 0 }, // %
    finalPrice: { type: Number, required: true }, // INR (computed)
    duration: { type: Number, required: true }, // days
    isActive: { type: Boolean, default: true },
    tag: { type: String, default: null }, // Popular / Best Value
  },
  { timestamps: true }
);

PlanSchema.pre("validate", function planPreValidate(next) {
  const price = Number(this.price || 0);
  const discount = Math.min(100, Math.max(0, Number(this.discount || 0)));
  this.discount = discount;
  const final = Math.round((price - price * (discount / 100)) * 100) / 100;
  this.finalPrice = final < 0 ? 0 : final;
  next();
});

module.exports = mongoose.model("Plan", PlanSchema);

