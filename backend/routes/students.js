const express = require("express");
const Student = require("../models/Student");
const upload = require("../src/middleware/upload.middleware");
const { uploadBuffer, isCloudinaryConfigured } = require("../src/utils/cloudinary");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../src/middleware/subscription.middleware");
const { writeLog } = require("../src/utils/logging");

const router = express.Router();

function toStudentResponse(student) {
  return {
    id: student._id.toString(),
    role: "student",
    libraryId: student.libraryId?.toString?.() || null,
    name: student.name,
    mobile: student.mobile,
    username: student.username,
    pin: "", // never return sensitive fields
    joinDate: student.joinDate.toISOString(),
    expiryDate: student.expiryDate.toISOString(),
    feeAmount: student.feeAmount,
    feeStatus: student.feeStatus,
    feeMethod: student.feeMethod || "cash",
    isBlocked: student.isBlocked,
    photoUrl: student.photoUrl || null,
  };
}

function parseJoinDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date, days) {
  const n = Math.max(1, Number(days || 30));
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

function parseMembershipDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  // Allow common plans: 30, 90, 180, 365 (fallback to 30)
  if ([30, 90, 180, 365].includes(Math.round(n))) return Math.round(n);
  return 30;
}

function parsePagination(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function requireLibraryIdForAdmin(req, res) {
  if (req.user?.role === "admin") {
    const libraryId = String(req.query.libraryId || req.body?.libraryId || "").trim();
    if (!libraryId || !mongoose.Types.ObjectId.isValid(libraryId)) {
      res.status(400).json({ message: "libraryId is required for admin" });
      return null;
    }
    return libraryId;
  }
  return req.user?.libraryId;
}

router.get("/", requireAuth, requireRole("admin", "library"), async (req, res) => {
  try {
    // Multi-tenant security enforced
    const libraryId = requireLibraryIdForAdmin(req, res);
    if (!libraryId) return;
    const { page, limit, skip } = parsePagination(req);

    const students = await Student.find({ libraryId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json(students.map(toStudentResponse));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch students", error: error.message });
  }
});

// Block student mutations if library subscription expired.
router.use(requireAuth, requireRole("library"), requireNotExpiredSubscription);

router.post("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const { name, mobile, username, pin, joinDate, feeAmount, feeStatus, feeMethod, isBlocked = false, membershipDays } = req.body;
    const parsedJoinDate = parseJoinDate(joinDate);
    if (!name || !mobile || !username || !pin || feeAmount === undefined || !feeStatus || !parsedJoinDate) {
      return res.status(400).json({ message: "Missing or invalid required fields" });
    }
    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }
    const libraryId = req.user.libraryId;
    if (!libraryId || !mongoose.Types.ObjectId.isValid(String(libraryId))) {
      return res.status(400).json({ message: "Invalid library account" });
    }

    const days = parseMembershipDays(membershipDays);

    const student = await Student.create({
      libraryId,
      name,
      mobile,
      username: String(username).trim().toLowerCase(),
      pinHash: await bcrypt.hash(String(pin).trim(), 10),
      joinDate: parsedJoinDate,
      expiryDate: addDays(parsedJoinDate, days),
      feeAmount: Number(feeAmount),
      feeStatus,
      feeMethod: String(feeMethod || "cash").trim().toLowerCase() === "upi" ? "upi" : "cash",
      isBlocked,
      isDeleted: false,
      createdBy: libraryId,
      updatedBy: libraryId,
    });

    // Track: student added
    writeLog({ action: "student_created", userId: String(req.user?.userId || ""), role: String(req.user?.role || ""), libraryId });
    return res.status(201).json(toStudentResponse(student));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Username or mobile already exists" });
    }
    return res.status(500).json({ message: "Failed to create student", error: error.message });
  }
});

router.put("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, username, pin, joinDate, feeAmount, feeStatus, feeMethod, isBlocked, membershipDays } = req.body;
    const updates = {};
    const libraryId = req.user.libraryId;
    if (!libraryId || !mongoose.Types.ObjectId.isValid(String(libraryId))) {
      return res.status(400).json({ message: "Invalid library account" });
    }

    if (name !== undefined) updates.name = name;
    if (mobile !== undefined) updates.mobile = mobile;
    if (username !== undefined) updates.username = username;
    if (username !== undefined) updates.username = String(username).trim().toLowerCase();
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ message: "PIN must be 4 digits" });
      }
      updates.pinHash = await bcrypt.hash(String(pin).trim(), 10);
    }
    if (feeAmount !== undefined) updates.feeAmount = Number(feeAmount);
    if (feeStatus !== undefined) updates.feeStatus = feeStatus;
    if (feeMethod !== undefined) updates.feeMethod = String(feeMethod).trim().toLowerCase() === "upi" ? "upi" : "cash";
    if (isBlocked !== undefined) updates.isBlocked = Boolean(isBlocked);
    updates.updatedBy = libraryId;

    if (joinDate !== undefined) {
      const parsedJoinDate = parseJoinDate(joinDate);
      if (!parsedJoinDate) {
        return res.status(400).json({ message: "Invalid joining date" });
      }
      updates.joinDate = parsedJoinDate;
      updates.expiryDate = addDays(parsedJoinDate, parseMembershipDays(membershipDays));
    }

    // Multi-tenant security enforced
    const updated = await Student.findOneAndUpdate(
      { _id: id, libraryId, isDeleted: false },
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Student not found" });

    return res.json(toStudentResponse(updated));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Username or mobile already exists" });
    }
    return res.status(500).json({ message: "Failed to update student", error: error.message });
  }
});

router.patch("/:id/block", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const { id } = req.params;
    const libraryId = req.user.libraryId;
    if (!libraryId || !mongoose.Types.ObjectId.isValid(String(libraryId))) {
      return res.status(400).json({ message: "Invalid library account" });
    }
    // Multi-tenant security enforced
    const existing = await Student.findOne({ _id: id, libraryId, isDeleted: false });
    if (!existing) return res.status(404).json({ message: "Student not found" });

    const nextValue = typeof req.body?.isBlocked === "boolean" ? req.body.isBlocked : !existing.isBlocked;
    existing.isBlocked = nextValue;
    existing.updatedBy = libraryId;
    await existing.save();

    return res.json(toStudentResponse(existing));
  } catch (error) {
    return res.status(500).json({ message: "Failed to update block status", error: error.message });
  }
});

router.delete("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    if (!libraryId || !mongoose.Types.ObjectId.isValid(String(libraryId))) {
      return res.status(400).json({ message: "Invalid library account" });
    }
    // Soft delete
    // Multi-tenant security enforced
    const deleted = await Student.findOneAndUpdate(
      { _id: req.params.id, libraryId, isDeleted: false },
      { isDeleted: true, updatedBy: libraryId },
      { new: true }
    );
    if (!deleted) return res.status(404).json({ message: "Student not found" });
    // Track: student deleted (soft delete)
    writeLog({ action: "student_deleted", userId: String(req.user?.userId || ""), role: String(req.user?.role || ""), libraryId });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete student", error: error.message });
  }
});

router.post("/:id/photo", requireAuth, requireRole("library"), upload.single("photo"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    if (!libraryId || !mongoose.Types.ObjectId.isValid(String(libraryId))) {
      return res.status(400).json({ message: "Invalid library account" });
    }
    // Multi-tenant security enforced
    const student = await Student.findOne({ _id: req.params.id, libraryId, isDeleted: false });
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!req.file) return res.status(400).json({ message: "No image file provided" });

    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ message: "Cloudinary is not configured on the server" });
    }

    const { url } = await uploadBuffer(req.file.buffer, {
      public_id: `student_${student._id}`,
      overwrite: true,
    });

    student.photoUrl = url;
    await student.save();

    return res.json(toStudentResponse(student));
  } catch (error) {
    return res.status(500).json({ message: "Photo upload failed", error: error.message });
  }
});

module.exports = router;
