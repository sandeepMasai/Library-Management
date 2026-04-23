const Library = require("../../models/Library");

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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

async function ensureLibraryNotExpired(library) {
  if (!library) return null;

  const expiry = library.planExpiryDate ? new Date(library.planExpiryDate).getTime() : null;
  if (!expiry) return library; // non-expiring plan (or already downgraded)

  if (Date.now() <= expiry) return library;

  // Downgrade to free limited plan (non-expiring)
  library.plan = "free";
  library.planStartDate = new Date();
  library.planExpiryDate = null;
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

  const start = new Date();
  const expiry = planDef.durationDays ? addDays(start, planDef.durationDays) : null;

  library.plan = planDef.plan;
  library.planStartDate = start;
  library.planExpiryDate = expiry;
  await library.save();

  return { library, planDef };
}

module.exports = {
  PLAN_CATALOG,
  ensureLibraryNotExpired,
  upgradeLibraryPlan,
};

