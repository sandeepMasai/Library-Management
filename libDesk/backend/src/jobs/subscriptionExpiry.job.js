const cron = require("node-cron");
const Library = require("../models/Library");
const Subscription = require("../models/Subscription");
const { logAction } = require("../utils/audit");
const logger = require("../utils/logger");
const { invalidateLibrarySubscriptionCache } = require("../utils/subscriptionCache");

let task = null;

async function expireSubscriptions() {
  const now = new Date();
  const expiredLibraries = await Library.find({
    planExpiryDate: { $ne: null, $lt: now },
    subscriptionStatus: { $ne: "expired" },
  }).select("_id plan currentPlanKey trialUsed planExpiryDate subscriptionStatus");

  let expiredCount = 0;
  if (expiredLibraries.length) {
    for (const library of expiredLibraries) {
      const previousStatus = library.subscriptionStatus;
      library.subscriptionStatus = "expired";
      library.plan = "none";
      library.currentPlanKey = "none";
      // Preserve trialUsed and planExpiryDate for audit/UI.
      // eslint-disable-next-line no-await-in-loop
      await library.save();
      invalidateLibrarySubscriptionCache(library._id);
      expiredCount += 1;

      // eslint-disable-next-line no-await-in-loop
      await logAction({
        action: "subscription_auto_expired",
        userId: library._id.toString(),
        role: "library",
        libraryId: library._id,
        metadata: {
          planExpiryDate: library.planExpiryDate?.toISOString?.() || null,
          previousStatus,
        },
      });
    }
  } else {
    logger.debug("Subscription expiry job: no libraries to downgrade", {
      expiredCount: 0,
    });
  }

  const subSync = await Subscription.syncExpiredFromDates();

  logger.info("Subscription expiry job completed", {
    expiredCount,
    subscriptionRowsExpired: subSync.modifiedCount,
  });
  return { expiredCount, subscriptionRowsExpired: subSync.modifiedCount };
}

function startSubscriptionExpiryJob() {
  if (process.env.SUBSCRIPTION_CRON_ENABLED === "false") {
    logger.info("Subscription expiry job disabled");
    return null;
  }

  if (task) return task;

  task = cron.schedule("0 * * * *", () => {
    expireSubscriptions().catch((error) => {
      logger.error("Subscription expiry job failed", { message: error?.message, stack: error?.stack });
    });
  });

  logger.info("Subscription expiry job scheduled", { schedule: "0 * * * *" });
  return task;
}

module.exports = {
  expireSubscriptions,
  startSubscriptionExpiryJob,
};
