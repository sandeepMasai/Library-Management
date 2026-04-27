const express = require("express");
const mongoose = require("mongoose");
const Space = require("../models/Space");
const Seat = require("../models/Seat");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function toResponse(space) {
  return {
    id: space._id.toString(),
    libraryId: space.libraryId?.toString?.() || null,
    name: space.name,
    order: space.order || 0,
  };
}

router.get("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const list = await Space.find({ libraryId }).sort({ order: 1, createdAt: 1 }).lean();
    return res.json(list.map(toResponse));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch spaces", error: error.message });
  }
});

router.post("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const name = String(req.body?.name || "").trim();
    const order = Number(req.body?.order || 0);
    if (!name) return res.status(400).json({ message: "name is required" });

    const created = await Space.create({ libraryId, name, order: Number.isFinite(order) ? order : 0 });
    return res.status(201).json(toResponse(created));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Space name already exists" });
    return res.status(500).json({ message: "Failed to create space", error: error.message });
  }
});

router.patch("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid space id" });

    const patch = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "name cannot be empty" });
      patch.name = name;
    }
    if (req.body?.order !== undefined) {
      const order = Number(req.body?.order);
      patch.order = Number.isFinite(order) ? order : 0;
    }

    const updated = await Space.findOneAndUpdate({ _id: id, libraryId }, patch, { new: true });
    if (!updated) return res.status(404).json({ message: "Space not found" });
    return res.json(toResponse(updated));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Space name already exists" });
    return res.status(500).json({ message: "Failed to update space", error: error.message });
  }
});

router.delete("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid space id" });

    const inUse = await Seat.exists({ libraryId, spaceId: id });
    if (inUse) {
      return res.status(409).json({ message: "Cannot delete space while seats are assigned" });
    }

    const deleted = await Space.findOneAndDelete({ _id: id, libraryId });
    if (!deleted) return res.status(404).json({ message: "Space not found" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete space", error: error.message });
  }
});

module.exports = router;

