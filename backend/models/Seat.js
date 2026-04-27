const mongoose = require("mongoose");

const seatSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    number: { type: Number, required: true, min: 1 },
    spaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Space", default: null, index: true },
    status: { type: String, enum: ["available", "occupied"], default: "available" },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
  },
  { timestamps: true }
);

// Multi-tenant isolation
seatSchema.index({ libraryId: 1, number: 1 }, { unique: true });
// NOTE: Do NOT enforce unique studentId here; occupancy is per-shift (SeatAllocation).

module.exports = mongoose.model("Seat", seatSchema);

