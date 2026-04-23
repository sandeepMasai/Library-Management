const express = require("express");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

const ALLOWED_CATEGORIES = new Set(["general", "festival", "closure", "hours", "rules", "event"]);

function normalizeCategory(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return ALLOWED_CATEGORIES.has(v) ? v : "general";
}

function toResponse(notification) {
  return {
    id: notification._id.toString(),
    libraryId: notification.libraryId?.toString?.() || null,
    title: notification.title,
    message: notification.message,
    date: notification.date.toISOString(),
    targetId: notification.targetId,
    targetType: notification.targetType || "all",
    category: notification.category || "general",
  };
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

router.get("/", requireAuth, requireRole("admin", "library", "student"), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Multi-tenant security enforced
    const libraryId = requireLibraryIdForAdmin(req, res);
    if (!libraryId) return;

    const { limit, skip } = parsePagination(req);

    const base = { libraryId, date: { $gte: thirtyDaysAgo } };
    const role = req.user.role;
    const userId = String(req.user.userId || "");
    const studentId = String(req.query.studentId || "").trim();

    let query = base;
    if (role === "student") {
      // Student sees: global(all) + personal(student)
      query = { ...base, $or: [{ targetType: "all", targetId: "all" }, { targetType: "student", targetId: userId }] };
    } else if (role === "library") {
      // Library sees: global(all) + library announcements
      query = { ...base, $or: [{ targetType: "all", targetId: "all" }, { targetType: "library" }] };
    } else if (studentId) {
      // Admin viewing a specific student: global(all) + that student
      query = { ...base, $or: [{ targetType: "all", targetId: "all" }, { targetType: "student", targetId: studentId }] };
    }

    const list = await Notification.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json(list.map(toResponse));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
});

router.post("/", requireAuth, requireRole("admin", "library"), async (req, res) => {
  try {
    const { title, message, targetId = "all", category: rawCategory, targetType: rawTargetType } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    const category = normalizeCategory(rawCategory);
    const targetType =
      rawTargetType === "student" || rawTargetType === "library" || rawTargetType === "all"
        ? rawTargetType
        : targetId && targetId !== "all"
          ? "student"
          : "all";

    // Multi-tenant security enforced
    const libraryId = requireLibraryIdForAdmin(req, res);
    if (!libraryId) return;

    const created = await Notification.create({
      libraryId,
      title,
      message,
      targetId: targetType === "all" ? "all" : String(targetId),
      targetType,
      category,
      date: new Date(),
    });

    return res.status(201).json(toResponse(created));
  } catch (error) {
    return res.status(500).json({ message: "Failed to send notification", error: error.message });
  }
});

module.exports = router;
