const mongoose = require("mongoose");

const allowedTypes = ["system", "custom"];

/**
 * Message Template
 *
 * - system: default templates (shared across libraries)
 * - custom: library-created templates (libraryId scoped)
 */
const templateSchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", default: null, index: true },
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: allowedTypes, required: true, default: "custom", index: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Ensure library custom template names are unique per library.
templateSchema.index({ libraryId: 1, name: 1 }, { unique: true, partialFilterExpression: { type: "custom" } });

module.exports = mongoose.model("Template", templateSchema);

