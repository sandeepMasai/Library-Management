const express = require("express");
const mongoose = require("mongoose");
const Library = require("../models/Library");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const Notification = require("../models/Notification");
const AttendanceQr = require("../models/AttendanceQr");
const Seat = require("../models/Seat");
const Log = require("../models/Log");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function toLibraryRow(lib) {
  return {
    id: lib._id.toString(),
    name: lib.name,
    ownerName: lib.ownerName,
    email: lib.email,
    plan: lib.plan,
    status: lib.isActive ? "active" : "blocked",
    isActive: Boolean(lib.isActive),
    libraryCode: lib.libraryCode,
    planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
    createdAt: lib.createdAt?.toISOString?.() || null,
  };
}

function parsePagination(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * GET /api/admin/dashboard
 *
 * Admin SaaS overview:
 * - Total libraries / active libraries
 * - Total students (across tenants)
 * - Revenue (simple placeholder: sum of student feeAmount where feeStatus === "Paid")
 */
router.get("/dashboard", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [totalLibraries, activeLibraries, totalStudents, revenueAgg] = await Promise.all([
      Library.countDocuments({}),
      Library.countDocuments({ isActive: true }),
      Student.countDocuments({ isDeleted: false }),
      Student.aggregate([
        { $match: { isDeleted: false, feeStatus: "Paid" } },
        { $group: { _id: null, revenue: { $sum: "$feeAmount" } } },
      ]),
    ]);

    const revenue = Number(revenueAgg?.[0]?.revenue || 0);

    return res.json({
      ok: true,
      stats: {
        totalLibraries,
        activeLibraries,
        totalStudents,
        revenue,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load admin dashboard", error: error.message });
  }
});

/**
 * GET /api/admin/libraries
 *
 * List libraries for admin table.
 */
router.get("/libraries", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const includeCounts =
      String(req.query.includeCounts || "").trim() === "1" ||
      String(req.query.includeCounts || "").trim().toLowerCase() === "true";
    const { page, limit, skip } = parsePagination(req);
    const totalPromise = Library.countDocuments({});

    if (!includeCounts) {
      const [total, list] = await Promise.all([
        totalPromise,
        Library.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);
      return res.json({ ok: true, libraries: list.map(toLibraryRow), page, limit, total });
    }

    const [total, rows] = await Promise.all([
      totalPromise,
      Library.aggregate([
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "students",
            let: { libId: "$_id" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$libraryId", "$$libId"] }, { $eq: ["$isDeleted", false] }] } } },
              { $count: "count" },
            ],
            as: "studentCounts",
          },
        },
        { $addFields: { studentCount: { $ifNull: [{ $first: "$studentCounts.count" }, 0] } } },
        { $project: { studentCounts: 0 } },
      ]),
    ]);

    return res.json({
      ok: true,
      libraries: rows.map((lib) => ({ ...toLibraryRow(lib), studentCount: Number(lib.studentCount || 0) })),
      page,
      limit,
      total,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch libraries", error: error.message });
  }
});

/**
 * GET /api/admin/students?page=&limit=
 *
 * Admin global students list (across all libraries).
 * Returns each student with their library info for card UI.
 */
router.get("/students", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);

    const [total, list] = await Promise.all([
      Student.countDocuments({ isDeleted: false }),
      Student.find({ isDeleted: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("name mobile username feeStatus feeAmount isBlocked libraryId createdAt")
        .populate("libraryId", "name ownerName email plan isActive")
        .lean(),
    ]);

    const students = list.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      mobile: s.mobile,
      username: s.username,
      feeStatus: s.feeStatus,
      feeAmount: s.feeAmount,
      isBlocked: Boolean(s.isBlocked),
      createdAt: s.createdAt?.toISOString?.() || null,
      library: s.libraryId
        ? {
            id: String(s.libraryId._id),
            name: s.libraryId.name,
            ownerName: s.libraryId.ownerName,
            email: s.libraryId.email,
            plan: s.libraryId.plan,
            isActive: Boolean(s.libraryId.isActive),
          }
        : null,
    }));

    return res.json({ ok: true, students, page, limit, total });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch students", error: error.message });
  }
});

/**
 * PATCH /api/admin/libraries/:id/block
 *
 * Block/unblock a library (toggle isActive unless explicit provided).
 */
router.patch("/libraries/:id/block", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid library id" });

    const lib = await Library.findById(id);
    if (!lib) return res.status(404).json({ message: "Library not found" });

    const next = typeof req.body?.isActive === "boolean" ? Boolean(req.body.isActive) : !lib.isActive;
    lib.isActive = next;
    await lib.save();
    return res.json({ ok: true, library: toLibraryRow(lib) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update library status", error: error.message });
  }
});

/**
 * DELETE /api/admin/libraries/:id
 *
 * Delete a library and tenant-scoped data.
 */
router.delete("/libraries/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid library id" });

    session.startTransaction();

    const lib = await Library.findById(id).session(session);
    if (!lib) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Library not found" });
    }

    const libraryId = lib._id;

    // Remove tenant data (best-effort, scoped by libraryId)
    await Promise.all([
      Student.deleteMany({ libraryId }).session(session),
      Attendance.deleteMany({ libraryId }).session(session),
      Notification.deleteMany({ libraryId }).session(session),
      AttendanceQr.deleteMany({ libraryId }).session(session),
      Seat.deleteMany({ libraryId }).session(session),
    ]);

    await Library.deleteOne({ _id: libraryId }).session(session);

    await session.commitTransaction();
    session.endSession();
    return res.status(204).send();
  } catch (error) {
    try { await session.abortTransaction(); } catch {}
    session.endSession();
    return res.status(500).json({ message: "Failed to delete library", error: error.message });
  }
});

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * GET /api/admin/analytics/revenue?months=6|12
 *
 * Returns:
 * - monthly revenue series for last N months (inclusive)
 * - active vs expired subscriptions (based on planExpiryDate + isActive)
 *
 * Notes:
 * - Revenue definition: sum of Student.feeAmount where feeStatus === "Paid"
 * - Month bucketing: Student.joinDate month (simple proxy)
 */
router.get("/analytics/revenue", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const months = Math.max(1, Math.min(24, Number(req.query.months || 6)));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    // Build month keys in order (e.g. 2026-01 ... 2026-06)
    const keys = [];
    for (let i = 0; i < months; i++) {
      keys.push(monthKey(new Date(start.getFullYear(), start.getMonth() + i, 1)));
    }

    // Revenue aggregation grouped by month
    const revenueAgg = await Student.aggregate([
      { $match: { isDeleted: false, feeStatus: "Paid", joinDate: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$joinDate" } },
          revenue: { $sum: "$feeAmount" },
        },
      },
    ]);

    const revenueByMonth = new Map(revenueAgg.map((r) => [String(r._id), Number(r.revenue || 0)]));
    const revenueSeries = keys.map((k) => ({ month: k, revenue: revenueByMonth.get(k) || 0 }));

    // Subscription status summary
    const [activeSubs, expiredSubs] = await Promise.all([
      Library.countDocuments({ isActive: true, $or: [{ planExpiryDate: null }, { planExpiryDate: { $gte: now } }] }),
      Library.countDocuments({ planExpiryDate: { $ne: null, $lt: now } }),
    ]);

    return res.json({
      ok: true,
      months,
      revenue: revenueSeries,
      subscriptions: {
        active: activeSubs,
        expired: expiredSubs,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load revenue analytics", error: error.message });
  }
});

/**
 * GET /api/admin/subscriptions?status=active|expired|all
 *
 * Returns subscription tracking rows:
 * - library name
 * - plan
 * - expiry date
 * - status (active/expired)
 *
 * Logic:
 * - If planExpiryDate < now → downgrade to free limited plan
 */
router.get("/subscriptions", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const status = String(req.query.status || "all").trim().toLowerCase();
    const now = new Date();

    // Auto-enforce expiry: downgrade expired paid plans to free (limited).
    // (Keeps data consistent without relying on a cron job.)
    await Library.updateMany(
      { planExpiryDate: { $ne: null, $lt: now }, plan: "pro" },
      { $set: { plan: "free", planStartDate: now, planExpiryDate: null } }
    );

    const match =
      status === "active"
        ? { $or: [{ planExpiryDate: null }, { planExpiryDate: { $gte: now } }] }
        : status === "expired"
          ? { planExpiryDate: { $ne: null, $lt: now } }
          : {};

    const list = await Library.find(match)
      .sort({ planExpiryDate: 1 })
      .select("name ownerName email plan planExpiryDate isActive")
      .lean();

    const rows = list.map((lib) => ({
      id: lib._id.toString(),
      name: lib.name,
      ownerName: lib.ownerName,
      email: lib.email,
      plan: lib.plan,
      expiryDate: lib.planExpiryDate?.toISOString?.() || null,
      status: lib.planExpiryDate && new Date(lib.planExpiryDate).getTime() < now.getTime() ? "expired" : "active",
      isActive: Boolean(lib.isActive),
    }));

    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load subscriptions", error: error.message });
  }
});

/**
 * POST /api/admin/notify
 *
 * Admin → libraries notification system.
 *
 * Input:
 * - title
 * - message
 * - target: "all" | libraryId
 *
 * Storage:
 * - Saves in notifications collection (tenant-scoped by libraryId).
 * - For target "all": creates one notification per library (so libraries can filter by their libraryId).
 */
router.post("/notify", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const message = String(req.body?.message || "").trim();
    const target = String(req.body?.target || "all").trim();

    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    const date = new Date();

    if (target === "all") {
      const libs = await Library.find({}).select("_id").lean();
      if (!libs.length) return res.status(201).json({ ok: true, created: 0 });

      const docs = libs.map((l) => ({
        libraryId: l._id,
        title,
        message,
        date,
        targetType: "library",
        targetId: "all",
        category: "general",
      }));
      await Notification.insertMany(docs, { ordered: false });
      return res.status(201).json({ ok: true, created: docs.length });
    }

    if (!mongoose.Types.ObjectId.isValid(target)) {
      return res.status(400).json({ message: "target must be 'all' or a valid libraryId" });
    }

    const lib = await Library.findById(target).select("_id").lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });

    const created = await Notification.create({
      libraryId: lib._id,
      title,
      message,
      date,
      targetType: "library",
      targetId: "all",
      category: "general",
    });

    return res.status(201).json({ ok: true, created: 1, id: created._id.toString() });
  } catch (error) {
    return res.status(500).json({ message: "Failed to send notification", error: error.message });
  }
});

/**
 * GET /api/admin/logs?libraryId=&from=&to=
 *
 * Filters:
 * - libraryId: optional
 * - from/to: ISO date strings (optional)
 *
 * Returns latest logs first.
 */
router.get("/logs", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const libraryId = String(req.query.libraryId || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const query = {};
    if (libraryId) {
      if (!mongoose.Types.ObjectId.isValid(libraryId)) {
        return res.status(400).json({ message: "Invalid libraryId" });
      }
      query.libraryId = libraryId;
    }

    if (from || to) {
      query.timestamp = {};
      if (from) {
        const d = new Date(from);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid from date" });
        query.timestamp.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid to date" });
        query.timestamp.$lte = d;
      }
    }

    const list = await Log.find(query).sort({ timestamp: -1 }).limit(500).lean();
    return res.json({
      ok: true,
      logs: list.map((l) => ({
        id: l._id.toString(),
        action: l.action,
        userId: l.userId || null,
        role: l.role || null,
        libraryId: l.libraryId?.toString?.() || null,
        timestamp: l.timestamp?.toISOString?.() || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch logs", error: error.message });
  }
});

module.exports = router;

