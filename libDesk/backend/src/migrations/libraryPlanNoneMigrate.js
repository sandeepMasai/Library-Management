/**
 * One-time-ish migration: removes legacy `free` library tier (`none` until paid).
 * Safe to run on every startup (mostly no-op once migrated).
 */
const logger = require("../utils/logger");

async function migrateLegacyLibraryPlans() {
  try {
    const mongoose = require("mongoose");
    const col = mongoose.connection.collection("libraries");

    const resPlan = await col.updateMany({ plan: "free" }, { $set: { plan: "none" } });
    const resKey = await col.updateMany(
      { currentPlanKey: "free" },
      { $set: { currentPlanKey: "none" } }
    );

    await col.updateMany(
      {
        plan: "none",
        subscriptionStatus: { $nin: ["active", "cancelled"] },
        planExpiryDate: null,
      },
      { $set: { planStartDate: null } }
    );

    await mongoose.connection.collection("subscriptions").updateMany(
      { plan: "free" },
      { $set: { plan: "trial", price: 99 } }
    );

    await mongoose.connection.collection("plans").deleteMany({ key: "free" });

    if (resPlan.modifiedCount || resKey.modifiedCount) {
      logger.info("Library plan migration applied", {
        librariesPlanFreeUpdated: resPlan.modifiedCount,
        librariesCurrentKeyFreeUpdated: resKey.modifiedCount,
      });
    }
  } catch (e) {
    logger.warn("Library plan migration skipped", { message: e?.message });
  }
}

module.exports = { migrateLegacyLibraryPlans };
