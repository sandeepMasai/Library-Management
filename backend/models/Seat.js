const mongoose = require("mongoose");

const seatSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    number: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["available", "occupied"], default: "available" },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
  },
  { timestamps: true }
);

// Multi-tenant isolation
seatSchema.index({ libraryId: 1, number: 1 }, { unique: true });
seatSchema.index({ libraryId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { studentId: { $type: "objectId" } } });

module.exports = mongoose.model("Seat", seatSchema);

