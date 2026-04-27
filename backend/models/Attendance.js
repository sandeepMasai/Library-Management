const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    // Multi-tenant isolation
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    attendanceDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/ // YYYY-MM-DD
    },
  },
  { timestamps: true }
);

// Prevent duplicate attendance per day
attendanceSchema.index(
  // Migration note: drop old unique index { studentId, attendanceDate } before applying this.
  { libraryId: 1, studentId: 1, attendanceDate: 1 },
  { unique: true }
);

attendanceSchema.index({ libraryId: 1, studentId: 1 });
attendanceSchema.index({ libraryId: 1, attendanceDate: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);