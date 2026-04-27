const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },

    plan: { type: String, enum: ["monthly", "6month", "yearly"], required: true },
    amount: { type: Number, required: true, min: 0 }, // in INR
    currency: { type: String, default: "INR" },

    // Razorpay ids
    orderId: { type: String, required: true, index: true },
    paymentId: { type: String, required: true, index: true },
    signature: { type: String, required: true },

    status: { type: String, enum: ["paid", "failed"], default: "paid", index: true },
    verifiedAt: { type: Date, default: Date.now },

    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

paymentSchema.index({ libraryId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1, paymentId: 1 }, { unique: true });

module.exports = mongoose.model("Payment", paymentSchema);

