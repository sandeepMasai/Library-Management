const express = require("express");
const Library = require("../models/Library");
const Subscription = require("../models/Subscription");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { ensureLibraryNotExpired, resolveLibrarySubscriptionPeriod } = require("../utils/subscription");
const { invalidateLibrarySubscriptionCache } = require("../utils/subscriptionCache");
const { writeLog } = require("../utils/logging");

const router = express.Router();

function libraryResponse(library, latestSub = null) {
  const period = resolveLibrarySubscriptionPeriod(library, latestSub);
  return {
    id: library._id.toString(),
    role: "library",
    name: library.name,
    ownerName: library.ownerName,
    email: library.email,
    city: library.city,
    plan: library.plan,
    currentPlanKey: library.currentPlanKey || (library.plan === "pro" ? "monthly" : "none"),
    trialUsed: Boolean(library.trialUsed),
    subscriptionStatus: library.subscriptionStatus || "inactive",
    cancelledAt: library.cancelledAt?.toISOString?.() || null,
    cancelReason: library.cancelReason || null,
    cancelNote: library.cancelNote || null,
    planStartDate: period.startDate,
    planExpiryDate: period.expiryDate,
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
    return res.status(403).json({
      message: "Direct upgrade is disabled. Please complete payment to activate a plan.",
      code: "UPGRADE_DISABLED",
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ message: error.message || "Failed to upgrade subscription" });
  }
});

/**
 * GET /api/subscription/me
 *
 * Returns the latest library subscription status (and downgrades if expired).
 * Useful for keeping the app state correct without re-login.
 */
router.get("/me", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user?.libraryId;
    const library = await Library.findById(libraryId);
    if (!library) return res.status(404).json({ message: "Library not found" });

    // 1) Expiry downgrade if needed
    await ensureLibraryNotExpired(library);
    invalidateLibrarySubscriptionCache(libraryId);

    // 2) Sync status with latest subscription row (best-effort)
    //    This helps "cancelled" reflect immediately even if client refreshes quickly.
    const latestSub = await Subscription.findOne({ libraryId }).sort({ createdAt: -1 }).lean();
    if (latestSub?.status === "cancelled" && library.subscriptionStatus !== "cancelled") {
      // Only mark cancelled if it hasn't expired already.
      const expMs = library.planExpiryDate ? new Date(library.planExpiryDate).getTime() : null;
      const stillActive = expMs && Number.isFinite(expMs) && Date.now() < expMs;
      if (stillActive) {
        library.subscriptionStatus = "cancelled";
        await library.save();
      }
    }

    // 3) Re-fetch fresh data (avoid returning stale mongoose doc after internal saves)
    const fresh = await Library.findById(libraryId).lean();
    if (!fresh) return res.status(404).json({ message: "Library not found" });
    return res.json({ ok: true, user: libraryResponse(fresh, latestSub) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load subscription", error: error.message });
  }
});

/**
 * POST /api/subscription/cancel
 *
 * Cancels future renewal (keeps access until expiryDate).
 */
router.post("/cancel", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user?.libraryId;
    const library = await Library.findById(libraryId);
    if (!library) return res.status(404).json({ message: "Library not found" });

    await ensureLibraryNotExpired(library); // if already expired, it will downgrade

    // If no expiryDate (already free/non-expiring), treat as already not cancellable.
    if (!library.planExpiryDate) {
      return res.status(400).json({ message: "No active expiring plan to cancel" });
    }

    if (library.subscriptionStatus === "cancelled") {
      const fresh0 = await Library.findById(libraryId).lean();
      const latest0 = await Subscription.findOne({ libraryId }).sort({ createdAt: -1 }).lean();
      return res.json({ ok: true, user: libraryResponse(fresh0 || library, latest0) });
    }

    const reasonRaw = req.body?.reason;
    const noteRaw = req.body?.note;
    const reason = reasonRaw === undefined || reasonRaw === null ? null : String(reasonRaw).trim();
    const note = noteRaw === undefined || noteRaw === null ? null : String(noteRaw).trim();

    library.subscriptionStatus = "cancelled";
    library.cancelledAt = new Date();
    library.cancelReason = reason ? reason.slice(0, 120) : null;
    library.cancelNote = note ? note.slice(0, 500) : null;
    await library.save();

    // Update latest active subscription row (best-effort; older rows remain for history).
    await Subscription.findOneAndUpdate(
      { libraryId: library._id, status: "active" },
      {
        $set: {
          status: "cancelled",
          cancelledAt: library.cancelledAt,
          cancelReason: library.cancelReason,
          cancelNote: library.cancelNote,
        },
      },
      { sort: { createdAt: -1 } }
    );
    invalidateLibrarySubscriptionCache(libraryId);

    // Log for admin analytics/audit (best-effort)
    writeLog({
      action: "subscription_cancelled",
      userId: library._id.toString(),
      role: "library",
      libraryId: library._id,
      timestamp: new Date(),
    });

    const fresh = await Library.findById(libraryId).lean();
    const latestSub = await Subscription.findOne({ libraryId }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, user: libraryResponse(fresh || library, latestSub) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to cancel subscription", error: error.message });
  }
});

/**
 * POST /api/subscription/retention-choice
 *
 * Stores retention flow choice for analytics (does not change subscription).
 */
router.post("/retention-choice", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user?.libraryId;
    const library = await Library.findById(libraryId);
    if (!library) return res.status(404).json({ message: "Library not found" });

    const choiceRaw = req.body?.choice;
    const choice = choiceRaw ? String(choiceRaw).trim() : "";
    if (!["accept_discount", "continue_cancel"].includes(choice)) {
      return res.status(400).json({ message: "Invalid choice" });
    }

    library.retentionChoice = choice;
    library.retentionChoiceAt = new Date();
    await library.save();
    invalidateLibrarySubscriptionCache(libraryId);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to store retention choice", error: error.message });
  }
});

module.exports = router;

