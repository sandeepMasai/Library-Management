const express = require("express");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");
const { upgradeLibraryPlan, ensureLibraryNotExpired, PLAN_CATALOG } = require("../src/utils/subscription");

const router = express.Router();

function libraryResponse(library) {
  return {
    id: library._id.toString(),
    role: "library",
    name: library.name,
    ownerName: library.ownerName,
    email: library.email,
    city: library.city,
    plan: library.plan,
    planStartDate: library.planStartDate?.toISOString?.() || null,
    planExpiryDate: library.planExpiryDate?.toISOString?.() || null,
    libraryCode: library.libraryCode,
    isActive: Boolean(library.isActive),
  };
}

/**
 * POST /api/subscription/upgrade
 *
 * Body:
 * - planKey: "free_trial" | "pro_monthly" | "pro_6_month" | "pro_yearly"
 *
 * Behavior:
 * - Requires library auth.
 * - Upgrades the plan and returns updated library fields.
 * - Payment is NOT handled here (hook your gateway later).
 */
router.post("/upgrade", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const planKey = String(req.body?.planKey || "").trim();
    const libraryId = req.user?.libraryId;

    const { library } = await upgradeLibraryPlan({ libraryId, planKey });
    await ensureLibraryNotExpired(library); // safety

    return res.status(200).json({
      ok: true,
      user: libraryResponse(library),
      catalog: PLAN_CATALOG,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || "Failed to upgrade subscription" });
  }
});

module.exports = router;

