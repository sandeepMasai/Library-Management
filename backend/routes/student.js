const express = require("express");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const Library = require("../models/Library");
const Attendance = require("../models/Attendance");
const Notification = require("../models/Notification");
const Seat = require("../models/Seat");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");
const upload = require("../src/middleware/upload.middleware");
const { uploadBuffer, isCloudinaryConfigured } = require("../src/utils/cloudinary");

const router = express.Router();

function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toStudentResponse(student, library) {
  return {
    id: student._id.toString(),
    role: "student",
    libraryId: student.libraryId?.toString?.() || null,
    library: library
      ? {
          id: library._id?.toString?.() || null,
          libraryName: library.name || "",
          logoUrl: library.logoUrl || null,
        }
      : null,
    name: student.name,
    mobile: student.mobile,
    username: student.username,
    joinDate: student.joinDate?.toISOString?.() || null,
    expiryDate: student.expiryDate?.toISOString?.() || null,
    feeStatus: student.feeStatus,
    feeAmount: student.feeAmount,
    isBlocked: Boolean(student.isBlocked),
    photoUrl: student.photoUrl || null,
  };
}

function toNotificationResponse(n) {
  return {
    id: n._id.toString(),
    title: n.title,
    message: n.message,
    date: n.date.toISOString(),
    targetId: n.targetId,
    targetType: n.targetType || "all",
    category: n.category || "general",
  };
}

/**
 * GET /api/student/me
 *
 * Student dashboard API (token-scoped).
 * - Multi-tenant security enforced: { libraryId, userId } must match the student record
 * - Never returns PIN / hashes
 */
router.get("/me", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const userId = String(req.user?.userId || "").trim();
    const libraryId = String(req.user?.libraryId || "").trim();

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({ message: "Invalid auth payload" });
    }

    // Multi-tenant security enforced
    const student = await Student.findOne({ _id: userId, libraryId, isDeleted: false }).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (student.isBlocked) return res.status(403).json({ message: "Account is blocked" });

    const todayKey = toDateKey(new Date());
    const ym = todayKey.slice(0, 7); // YYYY-MM

    const [library, todayAttendance, monthAttendanceCount, recentNotifications, seat] = await Promise.all([
      Library.findById(libraryId).select("name logoUrl").lean(),
      Attendance.findOne({ libraryId, studentId: userId, attendanceDate: todayKey }).lean(),
      Attendance.countDocuments({
        libraryId,
        studentId: userId,
        attendanceDate: { $regex: `^${ym}-` },
      }),
      Notification.find({
        libraryId,
        date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        $or: [
          { targetType: "all", targetId: "all" },
          { targetType: "student", targetId: userId },
        ],
      })
        .sort({ date: -1 })
        .limit(20)
        .lean(),
      Seat.findOne({ libraryId, studentId: userId, status: "occupied" }).lean(),
    ]);

    return res.json({
      ok: true,
      student: toStudentResponse(student, library),
      seat: seat ? { id: seat._id.toString(), number: seat.number } : null,
      attendance: {
        date: todayKey,
        markedToday: Boolean(todayAttendance),
        month: ym,
        monthCount: Number(monthAttendanceCount) || 0,
      },
      notifications: recentNotifications.map(toNotificationResponse),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load student dashboard", error: error.message });
  }
});

/**
 * POST /api/student/me/photo
 *
 * Student self-service profile photo update (token-scoped).
 * - Uses Cloudinary (same as library upload flow)
 */
router.post("/me/photo", requireAuth, requireRole("student"), upload.single("photo"), async (req, res) => {
  try {
    const userId = String(req.user?.userId || "").trim();
    const libraryId = String(req.user?.libraryId || "").trim();

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({ message: "Invalid auth payload" });
    }
    if (!req.file) return res.status(400).json({ message: "No image file provided" });
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ message: "Cloudinary is not configured on the server" });
    }

    // Multi-tenant security enforced
    const student = await Student.findOne({ _id: userId, libraryId, isDeleted: false });
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (student.isBlocked) return res.status(403).json({ message: "Account is blocked" });

    const { url } = await uploadBuffer(req.file.buffer, {
      public_id: `student_${student._id}`,
      overwrite: true,
    });

    student.photoUrl = url;
    await student.save();

    const library = await Library.findById(libraryId).select("name logoUrl").lean();
    return res.json({ ok: true, student: toStudentResponse(student, library) });
  } catch (error) {
    return res.status(500).json({ message: "Photo upload failed", error: error.message });
  }
});

/**
 * DELETE /api/student/me
 *
 * Student self-service delete account (soft delete).
 * - Marks student isDeleted=true
 * - Unassigns any occupied seat
 */
router.delete("/me", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const userId = String(req.user?.userId || "").trim();
    const libraryId = String(req.user?.libraryId || "").trim();

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({ message: "Invalid auth payload" });
    }

    // Multi-tenant security enforced
    const student = await Student.findOne({ _id: userId, libraryId, isDeleted: false });
    if (!student) return res.status(404).json({ message: "Student not found" });

    student.isDeleted = true;
    await student.save();

    await Seat.findOneAndUpdate(
      { libraryId, studentId: userId, status: "occupied" },
      { status: "available", studentId: null }
    );

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete account", error: error.message });
  }
});

module.exports = router;

