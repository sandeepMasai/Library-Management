const express = require("express");
const mongoose = require("mongoose");
const SeatAllocation = require("../models/SeatAllocation");
const Seat = require("../models/Seat");
const Shift = require("../models/Shift");
const Student = require("../models/Student");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function toResponse(a) {
  return {
    id: a._id.toString(),
    libraryId: a.libraryId?.toString?.() || null,
    seatId: a.seatId?.toString?.() || null,
    shiftId: a.shiftId?.toString?.() || null,
    studentId: a.studentId?.toString?.() || null,
    startDate: a.startDate?.toISOString?.() || a.startDate,
    endDate: a.endDate?.toISOString?.() || a.endDate,
    status: a.status,
    createdAt: a.createdAt?.toISOString?.() || a.createdAt,
    updatedAt: a.updatedAt?.toISOString?.() || a.updatedAt,
  };
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

router.get("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const shiftId = String(req.query.shiftId || "").trim();
    const spaceId = String(req.query.spaceId || "").trim();

    const query = { libraryId, status: "active" };
    if (shiftId) {
      if (!mongoose.Types.ObjectId.isValid(shiftId)) return res.status(400).json({ message: "Invalid shiftId" });
      query.shiftId = shiftId;
    }

    if (spaceId) {
      if (!mongoose.Types.ObjectId.isValid(spaceId)) return res.status(400).json({ message: "Invalid spaceId" });
      const seatIds = await Seat.find({ libraryId, spaceId }, { _id: 1 }).lean();
      query.seatId = { $in: seatIds.map((s) => s._id) };
    }

    const list = await SeatAllocation.find(query).sort({ createdAt: -1 }).lean();
    return res.json(list.map(toResponse));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch allocations", error: error.message });
  }
});

router.post("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const seatId = String(req.body?.seatId || "").trim();
    const shiftId = String(req.body?.shiftId || "").trim();
    const studentId = String(req.body?.studentId || "").trim();
    const startDate = parseDate(req.body?.startDate);
    const endDate = parseDate(req.body?.endDate);

    if (!mongoose.Types.ObjectId.isValid(seatId)) return res.status(400).json({ message: "Invalid seatId" });
    if (!mongoose.Types.ObjectId.isValid(shiftId)) return res.status(400).json({ message: "Invalid shiftId" });
    if (!mongoose.Types.ObjectId.isValid(studentId)) return res.status(400).json({ message: "Invalid studentId" });
    if (!startDate || !endDate) return res.status(400).json({ message: "Invalid startDate/endDate" });
    if (endDate.getTime() <= startDate.getTime()) return res.status(400).json({ message: "endDate must be after startDate" });

    const [seat, shift, student] = await Promise.all([
      Seat.findOne({ _id: seatId, libraryId }).lean(),
      Shift.findOne({ _id: shiftId, libraryId }).lean(),
      Student.findOne({ _id: studentId, libraryId, isDeleted: false }).lean(),
    ]);
    if (!seat) return res.status(404).json({ message: "Seat not found" });
    if (!shift) return res.status(404).json({ message: "Shift not found" });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const created = await SeatAllocation.create({
      libraryId,
      seatId,
      shiftId,
      studentId,
      startDate,
      endDate,
      status: "active",
    });

    return res.status(201).json(toResponse(created));
  } catch (error) {
    if (error?.code === 11000) {
      // Determine which unique constraint failed with a safe generic message.
      return res.status(409).json({ message: "Allocation conflict (seat/shift already filled or student already allocated)" });
    }
    return res.status(500).json({ message: "Failed to create allocation", error: error.message });
  }
});

router.patch("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid allocation id" });

    const status = String(req.body?.status || "").trim();
    if (status !== "cancelled") return res.status(400).json({ message: "Only status=cancelled is supported" });

    const updated = await SeatAllocation.findOneAndUpdate(
      { _id: id, libraryId },
      { status: "cancelled" },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Allocation not found" });
    return res.json(toResponse(updated));
  } catch (error) {
    return res.status(500).json({ message: "Failed to cancel allocation", error: error.message });
  }
});

module.exports = router;

