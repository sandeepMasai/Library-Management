const seatService = require("../services/seat.service");
const asyncHandler = require("../utils/asyncHandler");
const { createHttpError } = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

function trimOptional(value) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return String(value).trim();
}

function requireParamId(params, key = "id", message = "Invalid seatId") {
  const id = trimOptional(params?.[key]);
  if (!id) throw createHttpError(400, message);
  return id;
}

function sanitizeListQuery(query = {}) {
  return {
    ...(query.libraryId !== undefined ? { libraryId: trimOptional(query.libraryId) } : {}),
  };
}

function sanitizeCreateSeatBody(body = {}) {
  return {
    number: body.number,
    ...(body.spaceId !== undefined ? { spaceId: trimOptional(body.spaceId) } : {}),
  };
}

function sanitizeBulkCreateBody(body = {}) {
  return {
    totalSeats: body.totalSeats,
    ...(body.spaceId !== undefined ? { spaceId: trimOptional(body.spaceId) } : {}),
  };
}

function sanitizeUpdateSeatParams(params = {}) {
  return {
    id: requireParamId(params, "id", "Invalid seatId"),
  };
}

function sanitizeUpdateSeatBody(body = {}) {
  return {
    spaceId: body.spaceId === null || body.spaceId === "" ? null : trimOptional(body.spaceId),
  };
}

function sanitizeSeatActionInput(params = {}, body = {}, options = {}) {
  const seatId = params.id ? trimOptional(params.id) : trimOptional(body.seatId);
  if (!seatId) throw createHttpError(400, options.assign ? "Invalid seatId/studentId" : "Invalid seatId");

  return {
    params: params.id ? { id: seatId } : {},
    body: {
      seatId,
      ...(options.assign ? { studentId: trimOptional(body.studentId) } : {}),
    },
  };
}

const listSeats = asyncHandler(async (req, res) => {
  const seats = await seatService.listSeats({ user: req.user, query: sanitizeListQuery(req.query) });
  return sendSuccess(res, seats, "Seats fetched successfully");
});

const createSeat = asyncHandler(async (req, res) => {
  const seat = await seatService.createSeat({ user: req.user, body: sanitizeCreateSeatBody(req.body) });
  return sendSuccess(res, seat, "Seat created successfully", 201);
});

const bulkCreateSeats = asyncHandler(async (req, res) => {
  const seats = await seatService.bulkCreateSeats({ user: req.user, body: sanitizeBulkCreateBody(req.body) });
  return sendSuccess(res, seats, "Seats created successfully");
});

const updateSeatSpace = asyncHandler(async (req, res) => {
  const seat = await seatService.updateSeatSpace({
    user: req.user,
    params: sanitizeUpdateSeatParams(req.params),
    body: sanitizeUpdateSeatBody(req.body),
  });
  return sendSuccess(res, seat, "Seat updated successfully");
});

const assignSeat = asyncHandler(async (req, res) => {
  const input = sanitizeSeatActionInput(req.params, req.body, { assign: true });
  const seat = await seatService.assignSeat({ user: req.user, params: input.params, body: input.body });
  return sendSuccess(res, seat, "Seat assigned successfully");
});

const unassignSeat = asyncHandler(async (req, res) => {
  const input = sanitizeSeatActionInput(req.params, req.body);
  const seat = await seatService.unassignSeat({ user: req.user, params: input.params, body: input.body });
  return sendSuccess(res, seat, "Seat unassigned successfully");
});

module.exports = {
  listSeats,
  createSeat,
  bulkCreateSeats,
  updateSeatSpace,
  assignSeat,
  unassignSeat,
};
