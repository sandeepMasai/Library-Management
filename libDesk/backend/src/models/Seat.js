const mongoose = require("mongoose");

const SEAT_STATUS = [
  "available",
  "occupied",
  "maintenance",
  "inactive",
];

const seatSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
      immutable: true,
    },

    number: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Seat number must be integer",
      },
    },

    label: {
      type: String,
      default: null,
      trim: true,
      maxlength: 40,
    },

    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Space",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: SEAT_STATUS,
      default: "available",
      index: true,
    },

    /**
     * Backward compatibility only.
     * Real occupancy source = SeatAllocation.
     */
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    seatType: {
      type: String,
      enum: ["normal", "premium", "cabin", "vip"],
      default: "normal",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: { versionKey: false },
  }
);

seatSchema.set("strictQuery", true);

// Multi-tenant isolation
seatSchema.index(
  { libraryId: 1, number: 1 },
  { unique: true }
);

seatSchema.index({
  libraryId: 1,
  spaceId: 1,
  status: 1,
});

module.exports = mongoose.model(
  "Seat",
  seatSchema
);