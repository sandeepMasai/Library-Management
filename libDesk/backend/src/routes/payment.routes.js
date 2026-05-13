const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const Payment = require("../models/Payment");
const Library = require("../models/Library");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");
const { activatePaidSubscription } = require("../utils/subscription");
const { invalidateLibrarySubscriptionCache } = require("../utils/subscriptionCache");

const router = express.Router();

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    const err = new Error("Razorpay keys are not configured");
    err.statusCode = 500;
    throw err;
  }
  return { keyId, keySecret, client: new Razorpay({ key_id: keyId, key_secret: keySecret }) };
}

/**
 * POST /api/payment/create-order
 *
 * Body:
 * - plan: monthly | 6month | yearly
 *
 * Returns:
 * - orderId
 * - keyId
 * - amount (paise)
 */
router.post("/create-order", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user?.libraryId;
    const planId = String(req.body?.planId || "").trim();
    const lib = await Library.findById(libraryId).select("plan subscriptionStatus planExpiryDate trialUsed").lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });
    const expiryMs = lib.planExpiryDate ? new Date(lib.planExpiryDate).getTime() : null;
    const activeUntilExpiry =
      lib.plan === "pro" &&
      lib.subscriptionStatus !== "expired" &&
      expiryMs &&
      Number.isFinite(expiryMs) &&
      Date.now() < expiryMs;
    if (activeUntilExpiry) {
      return res.status(400).json({
        message: "Plan is active until expiry. You can change plan after it ends.",
        code: "PLAN_ACTIVE",
        planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
      });
    }
    const plan = await Plan.findById(planId).select("key finalPrice isActive isTrial showOnlyForNew").lean();
    if (!plan || !plan.isActive) return res.status(400).json({ message: "Invalid plan" });
    if (plan.isTrial && Boolean(lib.trialUsed)) {
      return res.status(400).json({ message: "Trial can be used only once", code: "TRIAL_USED" });
    }

    const { keyId, client } = getRazorpay();
    const amountPaise = Math.round(Number(plan.finalPrice) * 100);

    // Razorpay receipt max length is 40 chars.
    // Keep it deterministic + short: lib_<last8OfLibraryId>_<base36Ts>
    const libShort = String(libraryId || "").slice(-8) || "unknown";
    const tsShort = Date.now().toString(36); // shorter than ms integer
    const receipt = `lib_${libShort}_${tsShort}`.slice(0, 40);

    const order = await client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { libraryId: String(libraryId), planId: String(planId), planKey: String(plan.key) },
    });

    return res.json({
      ok: true,
      orderId: order.id,
      keyId,
      amount: amountPaise,
      currency: "INR",
      planId,
      planKey: plan.key,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const rpDesc = error?.error?.description || error?.description || null;
    const rpCode = error?.error?.code || error?.code || null;
    const message = rpDesc || error.message || "Failed to create order";
    return res.status(status).json({
      message,
      code: rpCode,
    });
  }
});

/**
 * POST /api/payment/verify
 *
 * Body:
 * - plan: monthly | 6month | yearly
 * - orderId
 * - paymentId
 * - signature
 *
 * Verifies signature using HMAC SHA256:
 * signature = HMAC_SHA256(orderId + "|" + paymentId, keySecret)
 *
 * On success:
 * - save Payment record
 * - activate/extend subscription
 */
router.post("/verify", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user?.libraryId;
    const planId = String(req.body?.planId || "").trim();
    const orderId = String(req.body?.orderId || "").trim();
    const paymentId = String(req.body?.paymentId || "").trim();
    const signature = String(req.body?.signature || "").trim();

    const plan = await Plan.findById(planId).select("key name price discount finalPrice duration isActive isTrial").lean();
    if (!plan || !plan.isActive) return res.status(400).json({ message: "Invalid plan" });
    if (!orderId || !paymentId) return res.status(400).json({ message: "Missing payment fields" });

    // Enforce one-time trial
    if (plan.isTrial) {
      const lib = await Library.findById(libraryId).select("trialUsed").lean();
      if (Boolean(lib?.trialUsed)) {
        return res.status(400).json({ message: "Trial can be used only once", code: "TRIAL_USED" });
      }
    }

    // Verification strategy:
    // 1) Prefer signature HMAC check when signature is present.
    // 2) UPI-intent (PhonePe) can intermittently return missing/invalid signature on device callback.
    //    In that case, fall back to Razorpay server fetch to confirm payment/order match and captured status.
    let verified = false;
    let verifyMode = "signature";
    try {
      const { keySecret, client } = getRazorpay();
      if (signature) {
        const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
        if (expected === signature) {
          verified = true;
        } else {
          console.log("[payment.verify] signature_mismatch", {
            libraryId: String(libraryId),
            planId,
            orderId,
            paymentId,
            expectedPrefix: String(expected).slice(0, 10),
            gotPrefix: String(signature).slice(0, 10),
          });
          // fallback below
          verifyMode = "razorpay_fetch";
        }
      } else {
        verifyMode = "razorpay_fetch";
      }

      if (!verified && verifyMode === "razorpay_fetch") {
        // Fetch payment details from Razorpay and validate.
        // Retry because UPI intent callbacks can race with capture updates.
        const expectedAmount = Math.round(Number(plan.finalPrice) * 100);
        let last = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          // eslint-disable-next-line no-await-in-loop
          const p = await client.payments.fetch(paymentId);
          const rpOrderId = String(p?.order_id || "");
          const rpStatus = String(p?.status || "");
          const rpAmount = Number(p?.amount || 0); // paise
          last = { rpOrderId, rpStatus, rpAmount };

          const ok =
            rpOrderId === orderId &&
            rpStatus === "captured" &&
            Number.isFinite(rpAmount) &&
            rpAmount === expectedAmount;
          if (ok) {
            verified = true;
            break;
          }

          if (attempt < 5) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 1500));
          }
        }

        if (!verified) {
          console.log("[payment.verify] razorpay_fetch_failed", {
            libraryId: String(libraryId),
            planId,
            orderId,
            paymentId,
            rpOrderId: last?.rpOrderId,
            rpStatus: last?.rpStatus,
            rpAmount: last?.rpAmount,
            expectedAmount,
          });
          return res.status(400).json({ message: "Payment verification failed", code: "VERIFY_FAILED" });
        }
      }
    } catch (e) {
      console.log("[payment.verify] verify_exception", {
        libraryId: String(libraryId),
        planId,
        orderId,
        paymentId,
        message: e?.message || String(e),
      });
      return res.status(500).json({ message: "Payment verification failed. Please try again.", code: "VERIFY_EXCEPTION" });
    }

    if (!verified) {
      return res.status(400).json({ message: "Payment verification failed", code: "VERIFY_FAILED" });
    }

    console.log("[payment.verify] verified_ok", { mode: verifyMode, libraryId: String(libraryId), planId, orderId, paymentId });

    // Idempotent save (unique index on orderId+paymentId).
    // IMPORTANT: only ignore duplicate key. Other errors must fail (otherwise plan may activate without a saved payment record).
    try {
      await Payment.create({
        libraryId,
        plan: plan.key,
        amount: plan.finalPrice,
        currency: "INR",
        orderId,
        paymentId,
        signature,
        status: "paid",
      });
    } catch (e) {
      if (e?.code === 11000) {
        // duplicate orderId+paymentId (retry) → ok
      } else {
        throw e;
      }
    }

    const { library } = await activatePaidSubscription({
      libraryId,
      plan: { key: plan.key, price: Number(plan.finalPrice), durationDays: Number(plan.duration || 0) },
    });
    invalidateLibrarySubscriptionCache(libraryId);

    return res.json({
      ok: true,
      message: "Subscription activated",
      user: {
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
        planStartDate: library.planStartDate?.toISOString?.() || null,
        planExpiryDate: library.planExpiryDate?.toISOString?.() || null,
        libraryCode: library.libraryCode,
        isActive: Boolean(library.isActive),
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const rpDesc = error?.error?.description || error?.description || null;
    const rpCode = error?.error?.code || error?.code || null;
    const message = rpDesc || error.message || "Failed to verify payment";
    return res.status(status).json({ message, code: rpCode });
  }
});

/**
 * GET /api/payment/history
 *
 * Library billing history:
 * - payments (from Payment collection)
 * - subscription events (activated/cancelled/expired)
 *
 * Returns unified list sorted by latest first.
 */
router.get("/history", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user?.libraryId;
    const now = new Date();

    const lib = await Library.findById(libraryId)
      .select("plan subscriptionStatus cancelledAt cancelReason cancelNote planStartDate planExpiryDate")
      .lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });

    const [payments, subs] = await Promise.all([
      Payment.find({ libraryId })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("plan amount currency status orderId paymentId createdAt meta")
        .lean(),
      Subscription.find({ libraryId })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("plan price startDate expiryDate status cancelledAt cancelReason cancelNote paymentStatus createdAt")
        .lean(),
    ]);

    const items = [];

    // Payment records
    for (const p of payments || []) {
      items.push({
        id: `payment-${String(p._id)}`,
        type: "payment",
        amount: Number(p.amount || 0),
        plan: p.plan,
        status: p.status || "paid",
        method: "razorpay",
        invoiceUrl: null,
        orderId: p.orderId,
        paymentId: p.paymentId,
        createdAt: p.createdAt?.toISOString?.() || null,
      });
    }

    // Subscription events from subscription rows
    for (const s of subs || []) {
      // Activation event (paid subscription row)
      items.push({
        id: `sub-${String(s._id)}-activated`,
        type: "subscription",
        status: "activated",
        plan: s.plan,
        amount: Number(s.price || 0),
        reason: null,
        note: null,
        expiryDate: s.expiryDate?.toISOString?.() || null,
        createdAt: (s.startDate || s.createdAt)?.toISOString?.() || null,
      });

      if (s.status === "cancelled") {
        items.push({
          id: `sub-${String(s._id)}-cancelled`,
          type: "subscription",
          status: "cancelled",
          plan: s.plan,
          amount: Number(s.price || 0),
          reason: s.cancelReason || null,
          note: s.cancelNote || null,
          expiryDate: s.expiryDate?.toISOString?.() || null,
          createdAt: (s.cancelledAt || s.createdAt)?.toISOString?.() || null,
        });
      }
    }

    // Expired event (computed) if planExpiryDate is in the past
    const expMs = lib.planExpiryDate ? new Date(lib.planExpiryDate).getTime() : null;
    if (expMs && Number.isFinite(expMs) && expMs < now.getTime()) {
      items.push({
        id: `lib-${String(libraryId)}-expired-${lib.planExpiryDate?.toISOString?.() || "unknown"}`,
        type: "subscription",
        status: "expired",
        plan: lib.plan === "pro" ? "monthly" : "none",
        amount: 0,
        reason: null,
        note: null,
        expiryDate: lib.planExpiryDate?.toISOString?.() || null,
        createdAt: lib.planExpiryDate?.toISOString?.() || null,
      });
    }

    // Cancel event from Library fields (fallback)
    if (lib.subscriptionStatus === "cancelled" && lib.cancelledAt) {
      items.push({
        id: `lib-${String(libraryId)}-cancelled-${lib.cancelledAt?.toISOString?.() || "unknown"}`,
        type: "subscription",
        status: "cancelled",
        plan: lib.plan === "pro" ? "monthly" : "none",
        amount: 0,
        reason: lib.cancelReason || null,
        note: lib.cancelNote || null,
        expiryDate: lib.planExpiryDate?.toISOString?.() || null,
        createdAt: lib.cancelledAt?.toISOString?.() || null,
      });
    }

    const sorted = items
      .filter((x) => x.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ ok: true, items: sorted });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load billing history", error: error.message });
  }
});

module.exports = router;

