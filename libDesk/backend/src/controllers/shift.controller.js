const shiftService = require("../services/shift.service");
const asyncHandler = require("../utils/asyncHandler");
const { createHttpError } = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

function assertLibrary(user) {
  if (user?.role !== "library") {
    throw createHttpError(403, "Forbidden");
  }
}

function trimString(value) {
  return String(value || "").trim();
}

function parseMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = trimString(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }
  return Number.NaN;
}

function validateTime(name, value) {
  const minutes = parseMinutes(value);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1439) {
    throw createHttpError(400, `Invalid ${name}`);
  }
  return minutes;
}

function validateTimeRange(body) {
  if (body.startTime === undefined || body.endTime === undefined) return;

  const startTime = validateTime("startTime", body.startTime);
  const endTime = validateTime("endTime", body.endTime);
  if (startTime >= endTime) {
    throw createHttpError(400, "endTime must be greater than startTime");
  }
}

function sanitizeCreateShiftBody(body = {}) {
  const name = trimString(body.name);
  if (!name) throw createHttpError(400, "name is required");
  if (body.startTime === undefined) throw createHttpError(400, "Invalid startTime");
  if (body.endTime === undefined) throw createHttpError(400, "Invalid endTime");
  validateTimeRange(body);

  return {
    name,
    startTime: body.startTime,
    endTime: body.endTime,
  };
}

function sanitizeUpdateShiftBody(body = {}) {
  const sanitized = {};
  if (body.name !== undefined) {
    const name = trimString(body.name);
    if (!name) throw createHttpError(400, "name cannot be empty");
    sanitized.name = name;
  }
  if (body.startTime !== undefined) sanitized.startTime = body.startTime;
  if (body.endTime !== undefined) sanitized.endTime = body.endTime;

  if (!Object.keys(sanitized).length) {
    throw createHttpError(400, "No shift fields provided");
  }

  validateTimeRange(sanitized);
  if (sanitized.startTime !== undefined) validateTime("startTime", sanitized.startTime);
  if (sanitized.endTime !== undefined) validateTime("endTime", sanitized.endTime);
  return sanitized;
}

function sanitizeShiftParams(params = {}) {
  const id = trimString(params.id);
  if (!id) throw createHttpError(400, "Invalid shift id");
  return { id };
}

const listShifts = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const shifts = await shiftService.listShifts({ user: req.user });
  return sendSuccess(res, shifts, "Shifts fetched successfully");
});

const createShift = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const shift = await shiftService.createShift({ user: req.user, body: sanitizeCreateShiftBody(req.body) });
  return sendSuccess(res, shift, "Shift created successfully", 201);
});

const updateShift = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const shift = await shiftService.updateShift({
    user: req.user,
    params: sanitizeShiftParams(req.params),
    body: sanitizeUpdateShiftBody(req.body),
  });
  return sendSuccess(res, shift, "Shift updated successfully");
});

const deleteShift = asyncHandler(async (req, res) => {
  assertLibrary(req.user);
  const result = await shiftService.deleteShift({ user: req.user, params: sanitizeShiftParams(req.params) });
  return sendSuccess(res, result, "Shift deleted successfully");
});

module.exports = {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
};
