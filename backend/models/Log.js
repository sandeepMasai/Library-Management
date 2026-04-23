const mongoose = require("mongoose");

/**
 * System activity log (admin/audit trail)
 *
 * What we track:
 * - action: what happened (login, student_created, student_deleted, attendance_marked, ...)
 * - userId/role: who performed it (or which account)
 * - libraryId: tenant scope (null for admin global events)
 * - timestamp: when it happened
 */
const logSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    userId: { type: String, default: null, trim: true, index: true },
    role: { type: String, default: null, trim: true, index: true },
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", default: null, index: true },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: false }
);

logSchema.index({ libraryId: 1, timestamp: -1 });

module.exports = mongoose.model("Log", logSchema);

