const express = require("express");
const mongoose = require("mongoose");
const Shift = require("../models/Shift");
const SeatAllocation = require("../models/SeatAllocation");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function toResponse(shift) {
  return {
    id: shift._id.toString(),
    libraryId: shift.libraryId?.toString?.() || null,
    name: shift.name,
    type: shift.type,
    startTime: shift.startTime,
    endTime: shift.endTime,
  };
}

function parseMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value || "").trim();
  // Accept "HH:mm"
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }
  return NaN;
}

router.get("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const list = await Shift.find({ libraryId }).sort({ startTime: 1, name: 1 }).lean();
    return res.json(list.map(toResponse));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch shifts", error: error.message });
  }
});

router.post("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const name = String(req.body?.name || "").trim();
    const type = String(req.body?.type || "custom").trim();
    const startTime = parseMinutes(req.body?.startTime);
    const endTime = parseMinutes(req.body?.endTime);
    if (!name) return res.status(400).json({ message: "name is required" });
    if (!Number.isFinite(startTime) || startTime < 0 || startTime > 1439) return res.status(400).json({ message: "Invalid startTime" });
    if (!Number.isFinite(endTime) || endTime < 0 || endTime > 1439) return res.status(400).json({ message: "Invalid endTime" });
    if (endTime <= startTime) return res.status(400).json({ message: "endTime must be greater than startTime" });

    const created = await Shift.create({ libraryId, name, type, startTime, endTime });
    return res.status(201).json(toResponse(created));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Shift name already exists" });
    return res.status(500).json({ message: "Failed to create shift", error: error.message });
  }
});

router.patch("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid shift id" });

    const patch = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "name cannot be empty" });
      patch.name = name;
    }
    if (req.body?.type !== undefined) patch.type = String(req.body?.type || "custom").trim();
    if (req.body?.startTime !== undefined) {
      const startTime = parseMinutes(req.body?.startTime);
      if (!Number.isFinite(startTime) || startTime < 0 || startTime > 1439) return res.status(400).json({ message: "Invalid startTime" });
      patch.startTime = startTime;
    }
    if (req.body?.endTime !== undefined) {
      const endTime = parseMinutes(req.body?.endTime);
      if (!Number.isFinite(endTime) || endTime < 0 || endTime > 1439) return res.status(400).json({ message: "Invalid endTime" });
      patch.endTime = endTime;
    }
    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const existing = await Shift.findOne({ _id: id, libraryId }).lean();
      if (!existing) return res.status(404).json({ message: "Shift not found" });
      const st = patch.startTime !== undefined ? patch.startTime : existing.startTime;
      const et = patch.endTime !== undefined ? patch.endTime : existing.endTime;
      if (et <= st) return res.status(400).json({ message: "endTime must be greater than startTime" });
    }

    const updated = await Shift.findOneAndUpdate({ _id: id, libraryId }, patch, { new: true });
    if (!updated) return res.status(404).json({ message: "Shift not found" });
    return res.json(toResponse(updated));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Shift name already exists" });
    return res.status(500).json({ message: "Failed to update shift", error: error.message });
  }
});

router.delete("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid shift id" });

    const inUse = await SeatAllocation.exists({ libraryId, shiftId: id, status: "active" });
    if (inUse) {
      return res.status(409).json({ message: "Cannot delete shift while active allocations exist" });
    }

    const deleted = await Shift.findOneAndDelete({ _id: id, libraryId });
    if (!deleted) return res.status(404).json({ message: "Shift not found" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete shift", error: error.message });
  }
});

module.exports = router;

