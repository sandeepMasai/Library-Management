const mongoose = require("mongoose");

const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: "present",
  ABSENT: "absent",
});

function normalizeToUtcStartOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid attendanceDate");
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const attendanceSchema = new mongoose.Schema(
  {
    // Multi-tenant isolation
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    attendanceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.PRESENT,
      index: true,
    },
  },
  { timestamps: true }
);

// Keep payloads clean for APIs (hide __v)
attendanceSchema.set("toJSON", { versionKey: false });

attendanceSchema.pre("validate", function normalizeAttendanceDate(next) {
  try {
    // Preserve existing behavior:
    // - If attendanceDate is missing/falsy, default to "today"
    // - Always normalize to UTC start-of-day
    // Optimization:
    // - Normalize only when needed (new doc or attendanceDate changed)
    if (!this.attendanceDate) {
      this.attendanceDate = normalizeToUtcStartOfDay(new Date());
    } else if (this.isNew || this.isModified("attendanceDate")) {
      this.attendanceDate = normalizeToUtcStartOfDay(this.attendanceDate);
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

// Prevent duplicate attendance per day
attendanceSchema.index(
  // Migration note: drop old unique index { studentId, attendanceDate } before applying this.
  { libraryId: 1, studentId: 1, attendanceDate: 1 },
  { unique: true }
);

attendanceSchema.index({ libraryId: 1, studentId: 1 });
attendanceSchema.index({ libraryId: 1, attendanceDate: 1 });
// Analytics-friendly indexes (optional usage)
attendanceSchema.index({ libraryId: 1, status: 1, attendanceDate: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);