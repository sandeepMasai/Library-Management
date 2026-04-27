const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const allowedFeeStatus = ["Paid", "Half Paid", "Pending"];
const allowedFeeMethods = ["cash", "upi"];

const studentSchema = new mongoose.Schema(
  {
    // Multi-tenant isolation
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    // Production: store only a hash
    pinHash: { type: String, required: true },
    joinDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    feeAmount: { type: Number, required: true, min: 0 },
    feeStatus: { type: String, enum: allowedFeeStatus, required: true },
    feeMethod: { type: String, enum: allowedFeeMethods, default: "cash" },
    isBlocked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    photoUrl: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Library", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Library", default: null },
  },
  { timestamps: true }
);

// Multi-tenant isolation
studentSchema.index({ libraryId: 1, username: 1 }, { unique: true });
// Mobile must be globally unique so students can login without libraryCode.
studentSchema.index({ mobile: 1 }, { unique: true });
studentSchema.index({ libraryId: 1, createdAt: -1 });

studentSchema.methods.verifyPin = async function verifyPin(pin) {
  return bcrypt.compare(String(pin || "").trim(), this.pinHash);
};

module.exports = mongoose.model("Student", studentSchema);
