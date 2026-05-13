const mongoose = require("mongoose");
const Shift = require("../models/Shift");
const SeatAllocation = require("../models/SeatAllocation");
const { createHttpError } = require("../utils/httpError");

function toShiftResponse(shift) {
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
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }
  return NaN;
}

function requireShiftId(value) {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) throw createHttpError(400, "Invalid shift id");
  return id;
}

function validateTimeRange(startTime, endTime) {
  if (!Number.isFinite(startTime) || startTime < 0 || startTime > 1439) throw createHttpError(400, "Invalid startTime");
  if (!Number.isFinite(endTime) || endTime < 0 || endTime > 1439) throw createHttpError(400, "Invalid endTime");
  if (endTime <= startTime) throw createHttpError(400, "endTime must be greater than startTime");
}

async function listShifts({ user }) {
  const list = await Shift.find({ libraryId: user.libraryId }).sort({ startTime: 1, name: 1 }).lean();
  return list.map(toShiftResponse);
}

async function createShift({ user, body }) {
  const name = String(body?.name || "").trim();
  const type = String(body?.type || "custom").trim();
  const startTime = parseMinutes(body?.startTime);
  const endTime = parseMinutes(body?.endTime);
  if (!name) throw createHttpError(400, "name is required");
  validateTimeRange(startTime, endTime);

  const created = await Shift.create({ libraryId: user.libraryId, name, type, startTime, endTime });
  return toShiftResponse(created);
}

async function updateShift({ user, params, body }) {
  const id = requireShiftId(params.id);
  const patch = {};
  if (body?.name !== undefined) {
    const name = String(body?.name || "").trim();
    if (!name) throw createHttpError(400, "name cannot be empty");
    patch.name = name;
  }
  if (body?.type !== undefined) patch.type = String(body?.type || "custom").trim();
  if (body?.startTime !== undefined) {
    const startTime = parseMinutes(body?.startTime);
    if (!Number.isFinite(startTime) || startTime < 0 || startTime > 1439) throw createHttpError(400, "Invalid startTime");
    patch.startTime = startTime;
  }
  if (body?.endTime !== undefined) {
    const endTime = parseMinutes(body?.endTime);
    if (!Number.isFinite(endTime) || endTime < 0 || endTime > 1439) throw createHttpError(400, "Invalid endTime");
    patch.endTime = endTime;
  }
  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    const existing = await Shift.findOne({ _id: id, libraryId: user.libraryId }).lean();
    if (!existing) throw createHttpError(404, "Shift not found");
    validateTimeRange(
      patch.startTime !== undefined ? patch.startTime : existing.startTime,
      patch.endTime !== undefined ? patch.endTime : existing.endTime
    );
  }

  const updated = await Shift.findOneAndUpdate({ _id: id, libraryId: user.libraryId }, patch, { new: true });
  if (!updated) throw createHttpError(404, "Shift not found");
  return toShiftResponse(updated);
}

async function deleteShift({ user, params }) {
  const id = requireShiftId(params.id);
  const inUse = await SeatAllocation.exists({ libraryId: user.libraryId, shiftId: id, status: "active" });
  if (inUse) throw createHttpError(409, "Cannot delete shift while active allocations exist");

  const deleted = await Shift.findOneAndDelete({ _id: id, libraryId: user.libraryId });
  if (!deleted) throw createHttpError(404, "Shift not found");
  return { ok: true };
}

module.exports = {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
};
