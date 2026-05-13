const mongoose = require("mongoose");

const SPACE_TYPES = [
  "hall",
  "room",
  "cabin",
  "vip",
  "floor",
  "custom",
];

const spaceSchema = new mongoose.Schema(
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

    order: {
      type: Number,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "order must be integer",
      },
    },

    type: {
      type: String,
      enum: SPACE_TYPES,
      default: "custom",
      index: true,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    maxSeats: {
      type: Number,
      default: null,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    archivedAt: {
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

spaceSchema.set("strictQuery", true);

spaceSchema.index(
  { libraryId: 1, name: 1 },
  { unique: true }
);

spaceSchema.index({
  libraryId: 1,
  order: 1,
});

module.exports = mongoose.model(
  "Space",
  spaceSchema
);