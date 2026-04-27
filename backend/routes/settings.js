const express = require("express");
const GlobalSettings = require("../models/GlobalSettings");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function isValidHttpUrl(input) {
  try {
    const u = new URL(String(input || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * GET /api/settings
 *
 * Public read (no auth required) so the app can fetch URLs dynamically.
 * Returns defaults if not configured yet.
 */
router.get("/", async (_req, res) => {
  try {
    const doc = await GlobalSettings.findById("global").lean();
    const legacyWhatsapp = String(doc?.defaultWhatsapp || "").trim();
    const legacyEmail = String(doc?.defaultEmail || "").trim();
    const legacyChannel = String(doc?.defaultCommunityLinks?.whatsappChannel || "").trim();
    return res.json({
      ok: true,
      settings: {
        privacyPolicyUrl: doc?.privacyPolicyUrl || "",
        termsUrl: doc?.termsUrl || "",
        communication: {
          whatsapp: doc?.communication?.whatsapp || legacyWhatsapp || "",
          channel: doc?.communication?.channel || legacyChannel || "",
          email: doc?.communication?.email || legacyEmail || "",
        },
        updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load settings", error: error.message });
  }
});

/**
 * PUT /api/settings
 *
 * Super Admin only (mapped to role: "admin").
 * Body: { privacyPolicyUrl, termsUrl }
 */
router.put("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const privacyPolicyUrl = String(req.body?.privacyPolicyUrl || "").trim();
    const termsUrl = String(req.body?.termsUrl || "").trim();
    const rawCommunication = req.body?.communication;

    if (!privacyPolicyUrl) return res.status(400).json({ message: "privacyPolicyUrl is required" });
    if (!termsUrl) return res.status(400).json({ message: "termsUrl is required" });
    if (!isValidHttpUrl(privacyPolicyUrl)) return res.status(400).json({ message: "Invalid privacyPolicyUrl" });
    if (!isValidHttpUrl(termsUrl)) return res.status(400).json({ message: "Invalid termsUrl" });

    let communication = undefined;
    if (rawCommunication !== undefined) {
      const w = rawCommunication?.whatsapp === undefined ? undefined : String(rawCommunication.whatsapp || "").trim();
      const c = rawCommunication?.channel === undefined ? undefined : String(rawCommunication.channel || "").trim();
      const e = rawCommunication?.email === undefined ? undefined : String(rawCommunication.email || "").trim();

      let whatsapp = undefined;
      if (w !== undefined) {
        const digits = w.replace(/\D/g, "");
        if (!digits) whatsapp = null;
        else if (!/^\d{10,15}$/.test(digits)) return res.status(400).json({ message: "Invalid communication.whatsapp (10–15 digits)" });
        else whatsapp = digits;
      }

      let channel = undefined;
      if (c !== undefined) {
        if (!c) channel = null;
        else if (!isValidHttpUrl(c)) return res.status(400).json({ message: "Invalid communication.channel" });
        else channel = c;
      }

      let email = undefined;
      if (e !== undefined) {
        const emailNorm = e.trim().toLowerCase();
        if (!emailNorm) email = null;
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Invalid communication.email" });
        else email = emailNorm;
      }

      communication = {
        ...(w !== undefined ? { whatsapp } : {}),
        ...(c !== undefined ? { channel } : {}),
        ...(e !== undefined ? { email } : {}),
      };
    }

    const doc = await GlobalSettings.findByIdAndUpdate(
      "global",
      { privacyPolicyUrl, termsUrl, ...(rawCommunication !== undefined ? { communication } : {}) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      ok: true,
      settings: {
        privacyPolicyUrl: doc.privacyPolicyUrl,
        termsUrl: doc.termsUrl,
        communication: {
          whatsapp: doc?.communication?.whatsapp || "",
          channel: doc?.communication?.channel || "",
          email: doc?.communication?.email || "",
        },
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update settings", error: error.message });
  }
});

module.exports = router;

