const express = require("express");
const Plan = require("../models/Plan");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

async function ensureSeed() {
  const count = await Plan.countDocuments({});
  if (count > 0) return;
  await Plan.insertMany(
    [
      { key: "free", name: "Free Plan", price: 0, discount: 0, duration: 0, isActive: true, tag: null },
      { key: "monthly", name: "Monthly", price: 999, discount: 0, duration: 30, isActive: true, tag: null },
      { key: "6month", name: "6 Month", price: 4999, discount: 0, duration: 180, isActive: true, tag: "Popular" },
      { key: "yearly", name: "Yearly", price: 9999, discount: 0, duration: 365, isActive: true, tag: "Best Value" },
    ],
    { ordered: false }
  );
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
    const filter = role === "admin" && wantAll ? {} : { isActive: true };
    const plans = await Plan.find(filter)
      .sort({ duration: 1, price: 1 })
      .select("name key price discount finalPrice duration isActive tag")
      .lean();
    return res.json({ ok: true, plans });
  } catch (error) {
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

    const plan = await Plan.create({ name, key, price, discount, duration, isActive, tag });
    return res.status(201).json({ ok: true, plan });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create plan", error: error.message });
  }
});

/**
 * PUT /api/plans/:id
 */
router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name || "").trim();
    if (req.body?.key !== undefined) patch.key = String(req.body.key || "").trim().toLowerCase();
    if (req.body?.price !== undefined) patch.price = Number(req.body.price);
    if (req.body?.discount !== undefined) patch.discount = Number(req.body.discount);
    if (req.body?.duration !== undefined) patch.duration = Number(req.body.duration);
    if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
    if (req.body?.tag !== undefined) patch.tag = req.body.tag === null ? null : String(req.body.tag || "").trim();

    const plan = await Plan.findById(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    Object.assign(plan, patch);
    await plan.save();
    return res.json({ ok: true, plan });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update plan", error: error.message });
  }
});

/**
 * DELETE /api/plans/:id
 */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const plan = await Plan.findByIdAndDelete(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete plan", error: error.message });
  }
});

module.exports = router;

