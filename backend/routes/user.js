const express = require("express");
const mongoose = require("mongoose");
const Library = require("../models/Library");
const Student = require("../models/Student");
const upload = require("../src/middleware/upload.middleware");
const { uploadBuffer, isCloudinaryConfigured } = require("../src/utils/cloudinary");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

/**
 * POST /api/user/upload-profile
 *
 * Upload profile image for current user.
 * - library: updates Library.logoUrl (used as profile image in UI)
 * - student: updates Student.photoUrl
 *
 * FormData:
 * - photo: image file
 */
router.post("/upload-profile", requireAuth, requireRole("library", "student"), upload.single("photo"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "photo is required" });
    if (!isCloudinaryConfigured()) return res.status(500).json({ message: "Cloudinary is not configured" });

    const { url } = await uploadBuffer(req.file.buffer, {
      folder: "libdesk/profile",
      transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
    });

    if (req.user?.role === "library") {
      const id = String(req.user?.libraryId || "").trim();
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid library account" });
      await Library.findByIdAndUpdate(id, { $set: { logoUrl: url } });
      return res.json({ ok: true, imageUrl: url });
    }

    // student
    const userId = String(req.user?.userId || "").trim();
    const libraryId = String(req.user?.libraryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({ message: "Invalid auth payload" });
    }
    await Student.findOneAndUpdate({ _id: userId, libraryId, isDeleted: false }, { $set: { photoUrl: url } });
    return res.json({ ok: true, imageUrl: url });
  } catch (error) {
    return res.status(500).json({ message: "Failed to upload profile image", error: error.message });
  }
});

module.exports = router;

