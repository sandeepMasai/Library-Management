const Library = require("../../models/Library");
const { ensureLibraryNotExpired } = require("../utils/subscription");

/**
 * Blocks access to protected library features when subscription is expired.
 * Allows:
 * - login
 * - viewing subscription
 * - payment endpoints (so user can upgrade)
 */
async function requireNotExpiredSubscription(req, res, next) {
  try {
    if (req.user?.role !== "library") return next();
    const libraryId = req.user?.libraryId;
    if (!libraryId) return res.status(401).json({ message: "Unauthorized" });

    const lib = await Library.findById(libraryId);
    if (!lib) return res.status(404).json({ message: "Library not found" });

    await ensureLibraryNotExpired(lib);

    if (lib.subscriptionStatus === "expired") {
      return res.status(402).json({
        message: "Subscription expired. Please upgrade to continue.",
        code: "SUBSCRIPTION_EXPIRED",
        user: {
          id: lib._id.toString(),
          role: "library",
          plan: lib.plan,
          currentPlanKey: lib.currentPlanKey || "free",
          trialUsed: Boolean(lib.trialUsed),
          subscriptionStatus: lib.subscriptionStatus || "expired",
          planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
        },
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({ message: "Subscription check failed", error: error.message });
  }
}

module.exports = {
  requireNotExpiredSubscription,
};

