const mongoose = require("mongoose");

const attendanceQrSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
    },

    token: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      minlength: 20,
      maxlength: 500,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    used: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Auto-delete expired QR
attendanceQrSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// Multi-tenant query optimization
attendanceQrSchema.index({
  libraryId: 1,
  token: 1,
});

attendanceQrSchema.pre("validate", function (next) {
  if (
    this.expiresAt &&
    this.generatedAt &&
    this.expiresAt <= this.generatedAt
  ) {
    return next(new Error("expiresAt must be after generatedAt"));
  }

  next();
});

module.exports = mongoose.model("AttendanceQr", attendanceQrSchema);