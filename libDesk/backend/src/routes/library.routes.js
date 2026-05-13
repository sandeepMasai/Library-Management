const express = require("express");
const Library = require("../models/Library");
const upload = require("../middleware/upload.middleware");
const { uploadBuffer, isCloudinaryConfigured } = require("../utils/cloudinary");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

function toLibraryProfile(lib) {
  return {
    id: lib._id.toString(),
    name: lib.ownerName, // account owner name
    email: lib.email,
    phone: lib.phone || "",
    whatsappNumber: lib.whatsappNumber || "",
    communication: {
      whatsapp: lib.communication?.whatsapp || "",
      channel: lib.communication?.channel || "",
      email: lib.communication?.email || "",
    },
    communityLinks: {
      whatsappGroup: lib.communityLinks?.whatsappGroup || "",
      whatsappChannel: lib.communityLinks?.whatsappChannel || "",
      telegram: lib.communityLinks?.telegram || "",
    },
    libraryName: lib.name,
    address: lib.address || "",
    city: lib.city || "",
    logoUrl: lib.logoUrl || null,
    plan: lib.plan,
    subscriptionStatus: lib.subscriptionStatus || "inactive",
    cancelledAt: lib.cancelledAt?.toISOString?.() || null,
    cancelReason: lib.cancelReason || null,
    cancelNote: lib.cancelNote || null,
    planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
  };
}

/**
 * GET /api/library/profile
 *
 * Returns profile data for:
 * - library role: full profile
 * - student role: ONLY library communication (no global merge)
 */
router.get("/profile", requireAuth, requireRole("library", "student"), async (req, res) => {
  try {
    const id = req.user?.libraryId;
    const lib = await Library.findById(id).lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });
    if (req.user?.role === "student") {
      const whatsapp = String(lib.communication?.whatsapp || lib.whatsappNumber || "").trim();
      const channel = String(lib.communication?.channel || lib.communityLinks?.whatsappChannel || "").trim();
      const email = String(lib.communication?.email || "").trim();
      return res.json({
        ok: true,
        profile: {
          libraryName: lib.name,
          communication: { whatsapp, channel, email },
        },
      });
    }
    return res.json({ ok: true, profile: toLibraryProfile(lib) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile", error: error.message });
  }
});

/**
 * PUT /api/library/profile
 *
 * Updates profile fields (no password changes here).
 */
router.put("/profile", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const id = req.user?.libraryId;
    const ownerName = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const rawWhatsapp = req.body?.whatsappNumber === undefined ? undefined : String(req.body.whatsappNumber || "").trim();
    const rawCommunity = req.body?.communityLinks;
    const rawCommunication = req.body?.communication;
    const libraryName = String(req.body?.libraryName || "").trim();
    const address = String(req.body?.address || "").trim();
    const city = String(req.body?.city || "").trim();

    if (!ownerName || !libraryName || !city) {
      return res.status(400).json({ message: "name, libraryName, city are required" });
    }

    let whatsappNumber = undefined;
    if (rawWhatsapp !== undefined) {
      const digits = rawWhatsapp.replace(/\D/g, "");
      if (!digits) {
        whatsappNumber = null;
      } else {
        const normalized = digits.length === 10 ? `91${digits}` : digits; // default India if missing country code
        if (!/^\d{10,15}$/.test(normalized)) {
          return res.status(400).json({ message: "Invalid whatsappNumber (10–15 digits, include country code)" });
        }
        whatsappNumber = normalized;
      }
    }

    function isValidHttpUrl(input) {
      try {
        const u = new URL(String(input || "").trim());
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }

    let communication = undefined;
    if (rawCommunication !== undefined) {
      const w = rawCommunication?.whatsapp === undefined ? undefined : String(rawCommunication.whatsapp || "").trim();
      const c = rawCommunication?.channel === undefined ? undefined : String(rawCommunication.channel || "").trim();
      const e = rawCommunication?.email === undefined ? undefined : String(rawCommunication.email || "").trim();

      const norm = (v) => (v ? v : null);

      let commWhatsapp = undefined;
      if (w !== undefined) {
        const digits = w.replace(/\D/g, "");
        if (!digits) commWhatsapp = null;
        else if (!/^\d{10,15}$/.test(digits)) return res.status(400).json({ message: "Invalid communication.whatsapp (10–15 digits)" });
        else commWhatsapp = digits;
      }

      let commChannel = undefined;
      if (c !== undefined) {
        if (!c) commChannel = null;
        else if (!isValidHttpUrl(c)) return res.status(400).json({ message: "Invalid communication.channel" });
        else commChannel = c;
      }

      let commEmail = undefined;
      if (e !== undefined) {
        const email = e.trim().toLowerCase();
        if (!email) commEmail = null;
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Invalid communication.email" });
        else commEmail = email;
      }

      communication = {
        ...(w !== undefined ? { whatsapp: commWhatsapp } : {}),
        ...(c !== undefined ? { channel: commChannel } : {}),
        ...(e !== undefined ? { email: commEmail } : {}),
      };
    }

    let communityLinks = undefined;
    if (rawCommunity !== undefined) {
      const wg = rawCommunity?.whatsappGroup === undefined ? undefined : String(rawCommunity.whatsappGroup || "").trim();
      const wc = rawCommunity?.whatsappChannel === undefined ? undefined : String(rawCommunity.whatsappChannel || "").trim();
      const tg = rawCommunity?.telegram === undefined ? undefined : String(rawCommunity.telegram || "").trim();

      const norm = (v) => (v ? v : null);
      if (wg && !isValidHttpUrl(wg)) return res.status(400).json({ message: "Invalid communityLinks.whatsappGroup" });
      if (wc && !isValidHttpUrl(wc)) return res.status(400).json({ message: "Invalid communityLinks.whatsappChannel" });
      if (tg && !isValidHttpUrl(tg)) return res.status(400).json({ message: "Invalid communityLinks.telegram" });

      communityLinks = {
        whatsappGroup: norm(wg),
        whatsappChannel: norm(wc),
        telegram: norm(tg),
      };
    }

    const updated = await Library.findByIdAndUpdate(
      id,
      {
        $set: {
          ownerName,
          phone: phone || null,
          name: libraryName,
          address: address || null,
          city,
          ...(rawWhatsapp !== undefined ? { whatsappNumber } : {}),
          ...(rawCommunity !== undefined ? { communityLinks } : {}),
          ...(rawCommunication !== undefined ? { communication } : {}),
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Library not found" });
    return res.json({ ok: true, profile: toLibraryProfile(updated) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
});

/**
 * POST /api/library/logo
 *
 * Uploads a new logo and updates Library.logoUrl.
 */
router.post("/logo", requireAuth, requireRole("library"), upload.single("logo"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "logo is required" });
    if (!isCloudinaryConfigured()) return res.status(500).json({ message: "Cloudinary is not configured" });

    const { url } = await uploadBuffer(req.file.buffer, {
      folder: "libdesk/library-logos",
      transformation: [{ width: 512, height: 512, crop: "fill", gravity: "center" }],
    });

    const id = req.user?.libraryId;
    const updated = await Library.findByIdAndUpdate(id, { $set: { logoUrl: url } }, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: "Library not found" });

    return res.json({ ok: true, logoUrl: url, profile: toLibraryProfile(updated) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to upload logo", error: error.message });
  }
});

module.exports = router;

