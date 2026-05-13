const mongoose = require("mongoose");

const ALLOCATION_STATUS = [
  "active",
  "cancelled",
  "expired",
];

const seatAllocationSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
      immutable: true,
    },

    seatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seat",
      required: true,
      index: true,
      immutable: true,
    },

    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
      index: true,
      immutable: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
      immutable: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
      validate: {
        validator() {
          return this.endDate > this.startDate;
        },
        message: "endDate must be after startDate",
      },
    },

    status: {
      type: String,
      enum: ALLOCATION_STATUS,
      default: "active",
      index: true,
    },

    allocationSource: {
      type: String,
      enum: ["manual", "auto", "renewal"],
      default: "manual",
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },

    expiredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: { versionKey: false },
  }
);

seatAllocationSchema.set("strictQuery", true);

// Query optimization
seatAllocationSchema.index({
  libraryId: 1,
  status: 1,
  createdAt: -1,
});

seatAllocationSchema.index({
  libraryId: 1,
  status: 1,
  endDate: 1,
});

seatAllocationSchema.index({
  libraryId: 1,
  seatId: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
});

seatAllocationSchema.index({
  libraryId: 1,
  studentId: 1,
  shiftId: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
});

// Prevent duplicate active student allocation
seatAllocationSchema.index(
  {
    libraryId: 1,
    studentId: 1,
    shiftId: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "active",
    },
  }
);

module.exports = mongoose.model(
  "SeatAllocation",
  seatAllocationSchema
);