const Library = require("../../models/Library");
const Subscription = require("../../models/Subscription");
const { getPlanDef } = require("./paymentPlans");

/**
 * Centralized subscription rules for library SaaS.
 *
 * Notes:
 * - We keep this intentionally simple (no payment gateway here).
 * - If a plan is expired, we downgrade the library to "free" (limited features).
 */

const PLAN_CATALOG = {
  free_trial: { plan: "free", price: 0, durationDays: 30 },
  pro_monthly: { plan: "pro", price: 999, durationDays: 30 },
  pro_6_month: { plan: "pro", price: 4999, durationDays: 180 },
  pro_yearly: { plan: "pro", price: 10000, durationDays: 365 },
};

function planKeyToAdminPlan(planKey) {
  const key = String(planKey || "").trim();
  if (key === "pro_monthly") return "monthly";
  if (key === "pro_6_month") return "6month";
  if (key === "pro_yearly") return "yearly";
  if (key === "free_trial") return "free";
  return null;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

async function ensureLibraryNotExpired(library) {
  if (!library) return null;

  const expiry = library.planExpiryDate ? new Date(library.planExpiryDate).getTime() : null;
  if (!expiry) return library; // non-expiring plan (or no plan yet)

  if (Date.now() <= expiry) return library;

  // Mark expired (do NOT reset trialUsed, do NOT grant any free period again).
  // Keep planExpiryDate as-is (in the past) for audit/debug and UI display.
  library.subscriptionStatus = "expired";
  library.plan = "free"; // limited access
  // Keep currentPlanKey so UI can show what plan they were on (optional),
  // but ensure it has a safe default.
  library.currentPlanKey = library.currentPlanKey || "free";
  await library.save();
  return library;
}

async function upgradeLibraryPlan({ libraryId, planKey }) {
  const key = String(planKey || "").trim();
  const planDef = PLAN_CATALOG[key];
  if (!planDef) {
    const err = new Error("Invalid plan");
    err.statusCode = 400;
    throw err;
  }

  const library = await Library.findById(libraryId);
  if (!library) {
    const err = new Error("Library not found");
    err.statusCode = 404;
    throw err;
  }

  // One-time free trial: never allow again once trialUsed is true.
  if (key === "free_trial" && library.trialUsed) {
    const err = new Error("Free trial can be used only once");
    err.statusCode = 400;
    throw err;
  }

  const start = new Date();
  const expiry = planDef.durationDays ? addDays(start, planDef.durationDays) : null;

  library.plan = planDef.plan;
  library.currentPlanKey = planKeyToAdminPlan(key) || (planDef.plan === "pro" ? "monthly" : "free");
  library.subscriptionStatus = "active";
  library.cancelledAt = null;
  library.planStartDate = start;
  library.planExpiryDate = expiry;
  if (key === "free_trial") {
    library.trialUsed = true;
  }
  await library.save();

  // Write a durable admin-friendly subscription row (used by admin screens).
  // For now paymentStatus defaults to "paid" (until payment gateway is connected).
  const adminPlan = planKeyToAdminPlan(key) || (planDef.plan === "pro" ? "monthly" : "free");
  if (expiry) {
    await Subscription.create({
      libraryId: library._id,
      plan: adminPlan,
      price: Number(planDef.price || 0),
      startDate: start,
      expiryDate: expiry,
      status: "active",
      paymentStatus: "paid",
    });
  }

  return { library, planDef };
}

module.exports = {
  PLAN_CATALOG,
  planKeyToAdminPlan,
  ensureLibraryNotExpired,
  upgradeLibraryPlan,
  /**
   * Activate (or extend) a paid subscription after verified payment.
   *
   * Plan: monthly | 6month | yearly
   */
  activatePaidSubscription: async ({ libraryId, plan }) => {
    // plan can be a key string or an object from admin-managed Plan collection.
    const def =
      typeof plan === "string" ? await getPlanDef(plan) : { key: plan.key, price: plan.price, durationDays: plan.durationDays };
    if (!def) {
      const err = new Error("Invalid plan");
      err.statusCode = 400;
      throw err;
    }

    const library = await Library.findById(libraryId);
    if (!library) {
      const err = new Error("Library not found");
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    const currentExpiryMs = library.planExpiryDate ? new Date(library.planExpiryDate).getTime() : null;
    const base = currentExpiryMs && Number.isFinite(currentExpiryMs) && currentExpiryMs > now.getTime() ? new Date(currentExpiryMs) : now;
    const nextExpiry = addDays(base, def.durationDays);

    library.plan = "pro";
    library.currentPlanKey = def.key;
    library.subscriptionStatus = "active";
    library.cancelledAt = null;
    library.cancelReason = null;
    library.cancelNote = null;
    library.planStartDate = now;
    library.planExpiryDate = nextExpiry;
    await library.save();

    await Subscription.create({
      libraryId: library._id,
      plan: def.key,
      price: def.price,
      startDate: now,
      expiryDate: nextExpiry,
      status: "active",
      paymentStatus: "paid",
    });

    return { library, subscription: { plan: def.key, price: def.price, startDate: now, expiryDate: nextExpiry } };
  },
};

