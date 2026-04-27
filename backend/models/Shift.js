const mongoose = require("mongoose");

const SHIFT_TYPES = ["morning", "evening", "full_day", "half_day", "custom"];

const shiftSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: SHIFT_TYPES, default: "custom" },
    startTime: { type: Number, required: true, min: 0, max: 24 * 60 - 1 },
    endTime: { type: Number, required: true, min: 0, max: 24 * 60 - 1 },
  },
  { timestamps: true }
);

shiftSchema.index({ libraryId: 1, name: 1 }, { unique: true });
shiftSchema.index({ libraryId: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model("Shift", shiftSchema);

