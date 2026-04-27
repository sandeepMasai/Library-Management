const mongoose = require("mongoose");

const seatAllocationSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    seatId: { type: mongoose.Schema.Types.ObjectId, ref: "Seat", required: true, index: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
  },
  { timestamps: true }
);

seatAllocationSchema.index(
  { libraryId: 1, seatId: 1, shiftId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
seatAllocationSchema.index(
  { libraryId: 1, studentId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

module.exports = mongoose.model("SeatAllocation", seatAllocationSchema);

