const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },

    plan: { type: String, enum: ["free", "monthly", "6month", "yearly"], required: true },
    price: { type: Number, required: true, min: 0 },

    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },

    // Cancelled overrides active/expired in UI; expired is computed by expiryDate.
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
    cancelledAt: { type: Date, default: null },

    paymentStatus: { type: String, enum: ["paid", "pending"], default: "paid", index: true },
    paymentNote: { type: String, default: null, trim: true },

    // Optional analytics: why cancelled (kept here for admin visibility)
    cancelReason: { type: String, default: null, trim: true },
    cancelNote: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

subscriptionSchema.index({ libraryId: 1, createdAt: -1 });
subscriptionSchema.index({ libraryId: 1, expiryDate: -1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);

