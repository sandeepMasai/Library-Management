const mongoose = require("mongoose");

const spaceSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

spaceSchema.index({ libraryId: 1, name: 1 }, { unique: true });
spaceSchema.index({ libraryId: 1, order: 1 });

module.exports = mongoose.model("Space", spaceSchema);

