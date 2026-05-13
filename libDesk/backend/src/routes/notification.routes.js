const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../middleware/subscription.middleware");
const Notification = require("../models/Notification");
const {
  formatNotificationForClient,
  markNotificationRead,
} = require("../services/notification.service");

const router = express.Router();

const ALLOWED_CATEGORIES = new Set([
  "general",
  "festival",
  "closure",
  "hours",
  "rules",
  "event",
]);

function normalizeCategory(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return ALLOWED_CATEGORIES.has(v) ? v : "general";
}

function parsePagination(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function requireLibraryIdForAdmin(req, res) {
  if (req.user?.role === "admin") {
    const libraryId = String(
      req.query.libraryId || req.body?.libraryId || ""
    ).trim();
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

    const libraryId = requireLibraryIdForAdmin(req, res);
    if (!libraryId) return;

    const { limit, skip } = parsePagination(req);

    const base = { libraryId, date: { $gte: thirtyDaysAgo } };
    const role = req.user.role;
    const userId = String(req.user.userId || "").trim();
    const studentId = String(req.query.studentId || "").trim();

    let query = base;
    if (role === "student") {
      const oid =
        userId && mongoose.Types.ObjectId.isValid(userId)
          ? new mongoose.Types.ObjectId(userId)
          : null;
      query = {
        ...base,
        $or: [
          { targetType: "all" },
          ...(oid
            ? [
                { targetType: "student", targetId: oid },
                { targetType: "student", targetId: userId },
              ]
            : []),
        ],
      };
    } else if (role === "library") {
      query = {
        ...base,
        $or: [{ targetType: "all" }, { targetType: "library" }],
      };
    } else if (studentId) {
      const sid = mongoose.Types.ObjectId.isValid(studentId)
        ? new mongoose.Types.ObjectId(studentId)
        : null;
      query = {
        ...base,
        $or: [
          { targetType: "all" },
          ...(sid
            ? [
                { targetType: "student", targetId: sid },
                { targetType: "student", targetId: studentId },
              ]
            : []),
        ],
      };
    }

    const unreadOnly =
      String(req.query.unreadOnly || "").toLowerCase() === "true" ||
      String(req.query.unreadOnly || "") === "1";
    if (unreadOnly && userId) {
      const unreadFrag = Notification.unreadReceiptFilter(userId);
      query =
        Object.keys(unreadFrag).length > 0
          ? { $and: [query, unreadFrag] }
          : query;
    }

    const list = await Notification.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json(
      list.map((n) => formatNotificationForClient(n, userId))
    );
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Per-user read receipt (idempotent). Preserves legacy isRead/readAt for library-target rows.
 */
router.patch(
  "/:id/read",
  requireAuth,
  requireRole("admin", "library", "student"),
  async (req, res) => {
    try {
      const libraryId = requireLibraryIdForAdmin(req, res);
      if (!libraryId) return;

      const userId = String(req.user.userId || "").trim();
      const role = req.user.role;

      const result = await markNotificationRead({
        notificationId: req.params.id,
        libraryId,
        userId,
        role,
      });

      return res.json(result);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ message: error.message });
      }
      return res.status(500).json({
        message: "Failed to mark notification read",
        error: error.message,
      });
    }
  }
);

router.post("/", requireAuth, requireRole("admin", "library"), async (req, res) => {
  try {
    const {
      title,
      message,
      targetId = "all",
      category: rawCategory,
      targetType: rawTargetType,
    } = req.body || {};
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

    const libraryId = requireLibraryIdForAdmin(req, res);
    if (!libraryId) return;

    if (req.user?.role === "library") {
      await new Promise((resolve, reject) =>
        requireNotExpiredSubscription(req, res, (err) => (err ? reject(err) : resolve()))
      );
      if (res.headersSent) return;
    }

    const created = await Notification.create({
      libraryId,
      title,
      message,
      targetId: targetType === "all" ? "all" : String(targetId),
      targetType,
      category,
      date: new Date(),
    });

    return res
      .status(201)
      .json(
        formatNotificationForClient(
          created.toObject ? created.toObject() : created,
          String(req.user.userId || "")
        )
      );
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send notification",
      error: error.message,
    });
  }
});

module.exports = router;
