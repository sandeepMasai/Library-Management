const mongoose = require("mongoose");

const SHIFT_TYPES = [
  "morning",
  "evening",
  "full_day",
  "half_day",
  "custom",
];

const shiftSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
      immutable: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    type: {
      type: String,
      enum: SHIFT_TYPES,
      default: "custom",
      index: true,
    },

    startTime: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
      validate: {
        validator: Number.isInteger,
        message: "startTime must be integer minutes",
      },
    },

    endTime: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
      validate: {
        validator: Number.isInteger,
        message: "endTime must be integer minutes",
      },
    },

    crossesMidnight: {
      type: Boolean,
      default: false,
    },

    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
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

shiftSchema.set("strictQuery", true);

shiftSchema.pre("validate", function (next) {
  const overnight = this.endTime <= this.startTime;

  this.crossesMidnight = overnight;

  this.durationMinutes = overnight
    ? (1440 - this.startTime) + this.endTime
    : this.endTime - this.startTime;

  if (this.durationMinutes <= 0) {
    return next(
      new Error("Invalid shift duration")
    );
  }

  next();
});

shiftSchema.index(
  { libraryId: 1, name: 1 },
  { unique: true }
);

shiftSchema.index({
  libraryId: 1,
  startTime: 1,
  endTime: 1,
});

module.exports = mongoose.model(
  "Shift",
  shiftSchema
);