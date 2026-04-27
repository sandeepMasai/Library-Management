const mongoose = require("mongoose");

const NOTIFICATION_CATEGORIES = [
  "general",
  "festival",
  "closure",
  "hours",
  "rules",
  "event",
];

const notificationSchema = new mongoose.Schema(
  {
    // Multi-tenant isolation
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "Library", required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    targetType: { type: String, enum: ["all", "student", "library"], default: "all" },
    targetId: { type: String, default: "all", trim: true }, // studentId when targetType=student
    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
      default: "general",
      trim: true,
    },
  },
  { timestamps: true }
);

// Auto-delete documents 30 days after the `date` field
notificationSchema.index({ date: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
notificationSchema.index({ libraryId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
