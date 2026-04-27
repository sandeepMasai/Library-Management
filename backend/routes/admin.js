const express = require("express");
const mongoose = require("mongoose");
const Library = require("../models/Library");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const Notification = require("../models/Notification");
const AttendanceQr = require("../models/AttendanceQr");
const Seat = require("../models/Seat");
const Log = require("../models/Log");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const PlanConfig = require("../models/PlanConfig");
const { ensurePlanConfigSeeded, DEFAULT_PLANS } = require("../src/utils/paymentPlans");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toLibraryRow(lib) {
  return {
    id: lib._id.toString(),
    name: lib.name,
    ownerName: lib.ownerName,
    email: lib.email,
    plan: lib.plan,
    subscriptionStatus: lib.subscriptionStatus || "active",
    cancelledAt: lib.cancelledAt?.toISOString?.() || null,
    cancelReason: lib.cancelReason || null,
    cancelNote: lib.cancelNote || null,
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
 * GET /api/admin/payment-plans
 *
 * Returns current plan pricing (admin-manageable).
 */
router.get("/payment-plans", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    await ensurePlanConfigSeeded();
    const rows = await PlanConfig.find({ key: { $in: Object.keys(DEFAULT_PLANS) } })
      .select("key title price durationDays active updatedAt")
      .sort({ key: 1 })
      .lean();
    return res.json({ ok: true, plans: rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load payment plans", error: error.message });
  }
});

/**
 * PUT /api/admin/payment-plans/:key
 *
 * Body:
 * - price: number (INR)
 * - durationDays: number
 * - title?: string
 * - active?: boolean
 */
router.put("/payment-plans/:key", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const key = String(req.params.key || "").trim().toLowerCase();
    if (!DEFAULT_PLANS[key]) return res.status(400).json({ message: "Invalid plan key" });

    const price = Number(req.body?.price);
    const durationDays = Number(req.body?.durationDays);
    const title = req.body?.title === undefined ? undefined : String(req.body?.title || "").trim();
    const active = req.body?.active === undefined ? undefined : Boolean(req.body?.active);

    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: "Invalid price" });
    if (!Number.isFinite(durationDays) || durationDays < 1) return res.status(400).json({ message: "Invalid durationDays" });

    await ensurePlanConfigSeeded();
    const next = await PlanConfig.findOneAndUpdate(
      { key },
      {
        $set: {
          ...(title !== undefined ? { title } : {}),
          price,
          durationDays,
          ...(active !== undefined ? { active } : {}),
        },
      },
      { new: true, upsert: true }
    )
      .select("key title price durationDays active updatedAt")
      .lean();

    return res.json({ ok: true, plan: next });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update payment plan", error: error.message });
  }
});

/**
 * GET /api/admin/libraries
 *
 * List libraries for admin table.
 */
router.get("/libraries", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const searchRaw = String(req.query.search || "").trim();
    const search = searchRaw.trim();
    const searchUpper = search.toUpperCase();
    const isCodeSearch = Boolean(search) && /^[A-Z0-9]{5,12}$/.test(searchUpper);
    const filter = !search
      ? {}
      : isCodeSearch
        ? { libraryCode: searchUpper }
        : { $or: [{ name: { $regex: escapeRegex(search), $options: "i" } }, { ownerName: { $regex: escapeRegex(search), $options: "i" } }] };

    const includeCounts =
      String(req.query.includeCounts || "").trim() === "1" ||
      String(req.query.includeCounts || "").trim().toLowerCase() === "true";
    const { page, limit, skip } = parsePagination(req);
    const totalPromise = Library.countDocuments(filter);

    if (!includeCounts) {
      const [total, list] = await Promise.all([
        totalPromise,
        Library.find(filter)
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
        { $match: filter },
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
 * GET /api/admin/library/:id
 *
 * Library detail page:
 * - full library profile fields
 * - stats: seats, total students, active students, revenue
 * - subscription info + cancellation reason
 */
router.get("/library/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid library id" });

    const lib = await Library.findById(id).lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });

    const libraryId = lib._id;
    const now = new Date();

    const [totalSeats, totalStudents, activeStudents, revenueAgg] = await Promise.all([
      Seat.countDocuments({ libraryId }),
      Student.countDocuments({ libraryId, isDeleted: false }),
      Student.countDocuments({
        libraryId,
        isDeleted: false,
        isBlocked: false,
        expiryDate: { $gte: now },
      }),
      Student.aggregate([
        { $match: { libraryId, isDeleted: false, feeStatus: "Paid" } },
        { $group: { _id: null, revenue: { $sum: "$feeAmount" } } },
      ]),
    ]);

    const revenue = Number(revenueAgg?.[0]?.revenue || 0);

    return res.json({
      ok: true,
      library: {
        id: lib._id.toString(),
        name: lib.name,
        libraryCode: lib.libraryCode,
        ownerName: lib.ownerName,
        email: lib.email,
        phone: lib.phone || null,
        address: lib.address || null,
        city: lib.city,
        isActive: Boolean(lib.isActive),
        plan: lib.plan,
        planStartDate: lib.planStartDate?.toISOString?.() || null,
        planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
        subscriptionStatus: lib.subscriptionStatus || "active",
        cancelledAt: lib.cancelledAt?.toISOString?.() || null,
        cancelReason: lib.cancelReason || null,
        cancelNote: lib.cancelNote || null,
        createdAt: lib.createdAt?.toISOString?.() || null,
      },
      stats: {
        totalSeats,
        totalStudents,
        activeStudents,
        revenue,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load library detail", error: error.message });
  }
});

/**
 * GET /api/admin/library/:id/subscription
 *
 * Subscription detail card for a single library:
 * - library info + owner info
 * - subscription (latest row) with computed status (active/expired/cancelled)
 * - stats (seats/students/active/revenue)
 */
router.get("/library/:id/subscription", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid library id" });

    const lib = await Library.findById(id)
      .select("name libraryCode ownerName phone email plan planStartDate planExpiryDate subscriptionStatus cancelledAt cancelReason cancelNote isActive")
      .lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });

    const libraryId = lib._id;
    const now = new Date();

    const latestSub = await Subscription.findOne({ libraryId }).sort({ createdAt: -1 }).lean();

    const plan = latestSub?.plan || (lib.plan === "pro" ? "monthly" : "free");
    const price = typeof latestSub?.price === "number" ? latestSub.price : lib.plan === "pro" ? 999 : 0;
    const startDate = (latestSub?.startDate || lib.planStartDate)?.toISOString?.() || null;
    const expiryDate = (latestSub?.expiryDate || lib.planExpiryDate)?.toISOString?.() || null;

    const endMs = latestSub?.expiryDate
      ? new Date(latestSub.expiryDate).getTime()
      : lib.planExpiryDate
        ? new Date(lib.planExpiryDate).getTime()
        : null;

    const isCancelled = (latestSub?.status === "cancelled") || lib.subscriptionStatus === "cancelled";
    const calcStatus = isCancelled ? "cancelled" : endMs && Number.isFinite(endMs) && endMs < now.getTime() ? "expired" : "active";

    const pay = latestSub?.paymentStatus || (plan === "free" ? "paid" : "paid");

    const [totalSeats, totalStudents, activeStudents, revenueAgg, recentPayments] = await Promise.all([
      Seat.countDocuments({ libraryId }),
      Student.countDocuments({ libraryId, isDeleted: false }),
      Student.countDocuments({
        libraryId,
        isDeleted: false,
        isBlocked: false,
        expiryDate: { $gte: now },
      }),
      Student.aggregate([
        { $match: { libraryId, isDeleted: false, feeStatus: "Paid" } },
        { $group: { _id: null, revenue: { $sum: "$feeAmount" } } },
      ]),
      Payment.find({ libraryId })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("plan amount currency status orderId paymentId createdAt")
        .lean(),
    ]);

    const revenue = Number(revenueAgg?.[0]?.revenue || 0);

    return res.json({
      ok: true,
      libraryName: lib.name,
      libraryCode: lib.libraryCode,
      isActive: Boolean(lib.isActive),
      libraryPlan: lib.plan, // free | pro (library-level)
      owner: {
        name: lib.ownerName,
        phone: lib.phone || null,
        email: lib.email,
      },
      subscription: {
        plan,
        price,
        startDate,
        expiryDate,
        status: calcStatus,
        paymentStatus: pay,
      },
      stats: {
        totalSeats,
        totalStudents,
        activeStudents,
        revenue,
      },
      payments: (recentPayments || []).map((p) => ({
        id: String(p._id),
        plan: p.plan,
        amount: Number(p.amount || 0),
        currency: p.currency || "INR",
        status: p.status || "paid",
        orderId: p.orderId,
        paymentId: p.paymentId,
        date: p.createdAt?.toISOString?.() || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load subscription detail", error: error.message });
  }
});

/**
 * POST /api/admin/subscription/cancel
 *
 * Admin action: mark library subscription as cancelled (keeps access until expiry).
 * Body: { libraryId }
 */
router.post("/subscription/cancel", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const libraryIdRaw = String(req.body?.libraryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(libraryIdRaw)) return res.status(400).json({ message: "Invalid libraryId" });

    const lib = await Library.findById(libraryIdRaw);
    if (!lib) return res.status(404).json({ message: "Library not found" });

    if (!lib.planExpiryDate) {
      return res.status(400).json({ message: "No active expiring plan to cancel" });
    }

    if (lib.subscriptionStatus !== "cancelled") {
      lib.subscriptionStatus = "cancelled";
      lib.cancelledAt = new Date();
      await lib.save();
    }

    await Subscription.updateOne(
      { libraryId: lib._id, status: "active" },
      { $set: { status: "cancelled", cancelledAt: lib.cancelledAt || new Date() } },
      { sort: { createdAt: -1 } }
    );

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to cancel subscription", error: error.message });
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
    const status = String(req.query.status || "all").trim().toLowerCase(); // all|active|expired|cancelled
    const paymentStatus = String(req.query.paymentStatus || "all").trim().toLowerCase(); // all|paid|pending
    const searchRaw = String(req.query.search || "").trim();
    const search = searchRaw.trim();
    const searchUpper = search.toUpperCase();
    const isCodeSearch = Boolean(search) && /^[A-Z0-9]{5,12}$/.test(searchUpper);
    const now = new Date();

    // New source of truth: Subscription collection (latest row per library).
    // Backward compatibility: if a library has no Subscription row yet, we fall back to Library plan fields.

    const searchMatch = !search
      ? {}
      : isCodeSearch
        ? { libraryCode: searchUpper }
        : { $or: [{ name: { $regex: escapeRegex(search), $options: "i" } }, { ownerName: { $regex: escapeRegex(search), $options: "i" } }] };

    function fallbackPlanMeta(lib) {
      if (lib.plan !== "pro") return { plan: "free", price: 0 };
      const start = lib.planStartDate ? new Date(lib.planStartDate).getTime() : null;
      const end = lib.planExpiryDate ? new Date(lib.planExpiryDate).getTime() : null;
      const days =
        start && end && Number.isFinite(start) && Number.isFinite(end)
          ? Math.round((end - start) / (24 * 60 * 60 * 1000))
          : null;
      if (days === 30) return { plan: "monthly", price: 999 };
      if (days === 180) return { plan: "6month", price: 4999 };
      if (days === 365) return { plan: "yearly", price: 10000 };
      return { plan: "monthly", price: 999 };
    }

    const list = await Library.aggregate([
      { $match: searchMatch },
      {
        $lookup: {
          from: Subscription.collection.name,
          let: { libraryId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$libraryId", "$$libraryId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "sub",
        },
      },
      { $addFields: { sub: { $arrayElemAt: ["$sub", 0] } } },
      { $sort: { planExpiryDate: 1, createdAt: -1 } },
      {
        $project: {
          name: 1,
          ownerName: 1,
          email: 1,
          plan: 1,
          planStartDate: 1,
          planExpiryDate: 1,
          subscriptionStatus: 1,
          cancelledAt: 1,
          libraryCode: 1,
          isActive: 1,
          sub: 1,
        },
      },
    ]);

    const rows = list
      .map((lib) => {
        const sub = lib.sub || null;

        const plan = sub?.plan || fallbackPlanMeta(lib).plan;
        const price = typeof sub?.price === "number" ? sub.price : fallbackPlanMeta(lib).price;
        const startDate = (sub?.startDate || lib.planStartDate)?.toISOString?.() || null;
        const expiryDate = (sub?.expiryDate || lib.planExpiryDate)?.toISOString?.() || null;
        const endMs = sub?.expiryDate ? new Date(sub.expiryDate).getTime() : lib.planExpiryDate ? new Date(lib.planExpiryDate).getTime() : null;

        const isCancelled = (sub?.status === "cancelled") || lib.subscriptionStatus === "cancelled";
        const calcStatus = isCancelled ? "cancelled" : endMs && Number.isFinite(endMs) && endMs < now.getTime() ? "expired" : "active";

        const pay = sub?.paymentStatus || (plan === "free" ? "paid" : "paid");

        return {
          id: (sub?._id || lib._id).toString(),
          libraryId: lib._id.toString(),
          libraryName: lib.name,
          libraryCode: lib.libraryCode,
          ownerName: lib.ownerName,
          email: lib.email,
          plan,
          price,
          startDate,
          expiryDate,
          status: calcStatus,
          paymentStatus: pay,
          cancelledAt: (sub?.cancelledAt || lib.cancelledAt)?.toISOString?.() || null,
          isActive: Boolean(lib.isActive),
        };
      })
      .filter((r) => (status === "all" ? true : r.status === status))
      .filter((r) => (paymentStatus === "all" ? true : r.paymentStatus === paymentStatus));

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

