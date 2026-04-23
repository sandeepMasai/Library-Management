const express = require("express");
const Library = require("../models/Library");
const upload = require("../src/middleware/upload.middleware");
const { uploadBuffer, isCloudinaryConfigured } = require("../src/utils/cloudinary");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function toLibraryProfile(lib) {
  return {
    id: lib._id.toString(),
    name: lib.ownerName, // account owner name
    email: lib.email,
    phone: lib.phone || "",
    libraryName: lib.name,
    address: lib.address || "",
    city: lib.city || "",
    logoUrl: lib.logoUrl || null,
    plan: lib.plan,
    planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
  };
}

/**
 * GET /api/library/profile
 *
 * Returns profile data for the authenticated library account.
 */
router.get("/profile", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const id = req.user?.libraryId;
    const lib = await Library.findById(id).lean();
    if (!lib) return res.status(404).json({ message: "Library not found" });
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
    const libraryName = String(req.body?.libraryName || "").trim();
    const address = String(req.body?.address || "").trim();
    const city = String(req.body?.city || "").trim();

    if (!ownerName || !libraryName || !city) {
      return res.status(400).json({ message: "name, libraryName, city are required" });
    }

    const updated = await Library.findByIdAndUpdate(
      id,
      { $set: { ownerName, phone: phone || null, name: libraryName, address: address || null, city } },
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

