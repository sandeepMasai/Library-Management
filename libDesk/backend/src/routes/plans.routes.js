const express = require("express");
const Plan = require("../models/Plan");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();
let seeded = false;

function calcFinal(price, discount) {
  const p = Number(price || 0);
  const d = Math.min(100, Math.max(0, Number(discount || 0)));
  return Math.max(0, Math.round((p - p * (d / 100)) * 100) / 100);
}

async function ensureSeed() {
  if (seeded) return;
  const defaults = [
    { key: "trial", name: "Trial Plan", price: 99, discount: 0, duration: 30, isTrial: true, showOnlyForNew: true, isActive: true, tag: "Start here" },
    { key: "monthly", name: "Monthly", price: 999, discount: 0, duration: 30, isTrial: false, showOnlyForNew: false, isActive: true, tag: null },
    { key: "6month", name: "6 Month", price: 4999, discount: 0, duration: 180, isTrial: false, showOnlyForNew: false, isActive: true, tag: "Popular" },
    { key: "yearly", name: "Yearly", price: 9999, discount: 0, duration: 365, isTrial: false, showOnlyForNew: false, isActive: true, tag: "Best Value" },
  ];

  try {
    for (const d of defaults) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await Plan.findOne({ key: d.key });
      if (!existing) {
        // eslint-disable-next-line no-await-in-loop
        await Plan.create(d);
        continue;
      }
      if (existing.isTrial === undefined) existing.isTrial = Boolean(d.isTrial);
      if (existing.showOnlyForNew === undefined) existing.showOnlyForNew = Boolean(d.showOnlyForNew);
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
    }
    seeded = true;
  } catch (error) {
    // keep seeded=false so next request can retry seeding
    seeded = false;
    throw error;
  }
}

/**
 * GET /api/plans
 *
 * Library sees active plans only.
 * Admin can see all by passing ?all=1
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureSeed();
    const role = req.user?.role;
    const wantAll = String(req.query.all || "").trim() === "1";
    if (wantAll && role !== "admin") {
      return res.status(403).json({ message: "Only Super Admin can access all plans" });
    }
    const filter = role === "admin" && wantAll ? {} : { isActive: true };

    // Library: show trial only if trial not used yet
    let trialUsed = null;
    if (role === "library") {
      if (!req.user?.libraryId) {
        trialUsed = false;
      } else {
        const Library = require("../models/Library");
        const lib = await Library.findById(req.user.libraryId).select("trialUsed").lean();
        trialUsed = Boolean(lib?.trialUsed);
      }
    }

    const raw = await Plan.find(filter)
      .sort({ duration: 1, finalPrice: 1 })
      .select("name key price discount finalPrice duration isActive tag isTrial showOnlyForNew")
      .lean();

    const plans = (raw || []).filter((p) => {
      if (!p) return false;
      if (role === "library" && Boolean(p.isTrial) && trialUsed) return false;
      return true;
    }).map((p) => ({
      ...p,
      finalPrice: calcFinal(p?.price, p?.discount),
    }));
    return res.json({ ok: true, plans });
  } catch (error) {
    console.error("Plan API Error:", error);
    return res.status(500).json({ message: "Failed to load plans", error: error.message });
  }
});

/**
 * POST /api/plans
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const key = String(req.body?.key || "").trim().toLowerCase();
    const price = Number(req.body?.price);
    const discount = Number(req.body?.discount ?? 0);
    const duration = Number(req.body?.duration);
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive);
    const tag = req.body?.tag === undefined || req.body?.tag === null ? null : String(req.body.tag).trim();

    if (!name) return res.status(400).json({ message: "name is required" });
    if (!key) return res.status(400).json({ message: "key is required" });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: "Invalid price" });
    if (!Number.isFinite(duration) || duration < 0) return res.status(400).json({ message: "Invalid duration" });
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return res.status(400).json({ message: "Invalid discount" });

    const existing = await Plan.findOne({ key }).select("_id").lean();
    if (existing) {
      return res.status(400).json({ message: "Plan key already exists" });
    }

    const finalPrice = calcFinal(price, discount);
    const plan = await Plan.create({ name, key, price, discount, finalPrice, duration, isActive, tag });
    return res.status(201).json({ ok: true, plan });
  } catch (error) {
    console.error("Plan API Error:", error);
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Plan key already exists" });
    }
    return res.status(500).json({ message: "Failed to create plan", error: error.message });
  }
});

/**
 * PUT /api/plans/:id
 */
router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const plan = await Plan.findById(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name || "").trim();
    if (req.body?.key !== undefined) patch.key = String(req.body.key || "").trim().toLowerCase();
    if (req.body?.price !== undefined) patch.price = Number(req.body.price);
    if (req.body?.discount !== undefined) patch.discount = Number(req.body.discount);
    if (req.body?.duration !== undefined) patch.duration = Number(req.body.duration);
    if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
    if (req.body?.tag !== undefined) patch.tag = req.body.tag === null ? null : String(req.body.tag || "").trim();

    if (patch.name !== undefined && patch.name === "") {
      return res.status(400).json({ message: "name cannot be empty" });
    }
    if (patch.key !== undefined && patch.key === "") {
      return res.status(400).json({ message: "key cannot be empty" });
    }
    if (patch.price !== undefined && (!Number.isFinite(patch.price) || patch.price < 0)) {
      return res.status(400).json({ message: "Invalid price" });
    }
    if (patch.discount !== undefined && (!Number.isFinite(patch.discount) || patch.discount < 0 || patch.discount > 100)) {
      return res.status(400).json({ message: "Invalid discount" });
    }
    if (patch.duration !== undefined && (!Number.isFinite(patch.duration) || patch.duration < 0)) {
      return res.status(400).json({ message: "Invalid duration" });
    }

    if (patch.price !== undefined || patch.discount !== undefined) {
      const nextPrice = patch.price !== undefined ? patch.price : plan?.price;
      const nextDiscount = patch.discount !== undefined ? patch.discount : plan?.discount;
      patch.finalPrice = calcFinal(nextPrice, nextDiscount);
    }

    Object.assign(plan, patch);
    await plan.save();
    return res.json({ ok: true, plan });
  } catch (error) {
    console.error("Plan API Error:", error);
    return res.status(500).json({ message: "Failed to update plan", error: error.message });
  }
});

/**
 * DELETE /api/plans/:id
 */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const plan = await Plan.findById(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (plan.key === "trial") {
      return res.status(400).json({ message: "Cannot delete system plan" });
    }
    await Plan.deleteOne({ _id: plan._id });
    return res.json({ ok: true });
  } catch (error) {
    console.error("Plan API Error:", error);
    return res.status(500).json({ message: "Failed to delete plan", error: error.message });
  }
});

module.exports = router;

