const mongoose = require("mongoose");
const SeatAllocation = require("../models/SeatAllocation");
const Seat = require("../models/Seat");
const Shift = require("../models/Shift");
const Student = require("../models/Student");
const { createHttpError } = require("../utils/httpError");
const { logAction } = require("../utils/audit");

const ALLOCATION_STATUS = Object.freeze({
  ACTIVE: "active",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 25,
  maxLimit: 200,
});

const MAX_ALLOCATION_DURATION_DAYS = Number.parseInt(process.env.MAX_ALLOCATION_DURATION_DAYS || "366", 10);
const MAX_ALLOCATION_DURATION_MS =
  Number.isFinite(MAX_ALLOCATION_DURATION_DAYS) && MAX_ALLOCATION_DURATION_DAYS > 0
    ? MAX_ALLOCATION_DURATION_DAYS * 24 * 60 * 60 * 1000
    : 366 * 24 * 60 * 60 * 1000;

const POPULATE = Object.freeze({
  seat: { path: "seatId", select: "number spaceId" },
  shift: { path: "shiftId", select: "name type startTime endTime" },
  student: { path: "studentId", select: "name mobile username photoUrl" },
});

function toAllocationResponse(allocation) {
  const seatDoc = allocation?.seatId && typeof allocation.seatId === "object" ? allocation.seatId : null;
  const shiftDoc = allocation?.shiftId && typeof allocation.shiftId === "object" ? allocation.shiftId : null;
  const studentDoc =
    allocation?.studentId && typeof allocation.studentId === "object" ? allocation.studentId : null;

  return {
    id: allocation._id.toString(),
    libraryId: allocation.libraryId?.toString?.() || null,
    seatId: seatDoc?._id?.toString?.() || allocation.seatId?.toString?.() || null,
    shiftId: shiftDoc?._id?.toString?.() || allocation.shiftId?.toString?.() || null,
    studentId: studentDoc?._id?.toString?.() || allocation.studentId?.toString?.() || null,
    startDate: allocation.startDate?.toISOString?.() || allocation.startDate,
    endDate: allocation.endDate?.toISOString?.() || allocation.endDate,
    status: allocation.status,
    createdAt: allocation.createdAt?.toISOString?.() || allocation.createdAt,
    updatedAt: allocation.updatedAt?.toISOString?.() || allocation.updatedAt,
    ...(seatDoc?._id
      ? {
        seat: {
          id: seatDoc._id.toString(),
          number: seatDoc.number ?? null,
          spaceId: seatDoc.spaceId?.toString?.() || null,
        },
      }
      : {}),
    ...(shiftDoc?._id
      ? {
        shift: {
          id: shiftDoc._id.toString(),
          name: shiftDoc.name ?? null,
          type: shiftDoc.type ?? null,
          startTime: shiftDoc.startTime ?? null,
          endTime: shiftDoc.endTime ?? null,
        },
      }
      : {}),
    ...(studentDoc?._id
      ? {
        student: {
          id: studentDoc._id.toString(),
          name: studentDoc.name ?? null,
          mobile: studentDoc.mobile ?? null,
          username: studentDoc.username ?? null,
          photoUrl: studentDoc.photoUrl ?? null,
        },
      }
      : {}),
  };
}

function parseIsoDateStrict(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  // Accept:
  // - Date-only: YYYY-MM-DD (interpreted as UTC midnight)
  // - Full ISO timestamp with timezone: ...Z or ...+05:30
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const date = new Date(`${s}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)
  ) {
    return null;
  }
  const date = new Date(s);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getPagination(query) {
  const pageRaw = query?.page;
  const limitRaw = query?.limit;
  const shouldPaginate = pageRaw != null || limitRaw != null;
  if (!shouldPaginate) return { shouldPaginate: false };

  const page = parsePositiveInt(pageRaw, DEFAULT_PAGINATION.page);
  const limit = Math.min(parsePositiveInt(limitRaw, DEFAULT_PAGINATION.limit), DEFAULT_PAGINATION.maxLimit);
  const skip = (page - 1) * limit;
  return { shouldPaginate: true, page, limit, skip };
}

function requireObjectId(value, message) {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) throw createHttpError(400, message);
  return id;
}

function buildDateOverlapFilter(startDate, endDate) {
  // Overlap exists iff existing.start < newEnd AND existing.end > newStart
  return { $and: [{ startDate: { $lt: endDate } }, { endDate: { $gt: startDate } }] };
}

function normalizeAllocationStatus(value) {
  const s = String(value || "").trim().toLowerCase();
  if (s === ALLOCATION_STATUS.ACTIVE) return ALLOCATION_STATUS.ACTIVE;
  if (s === ALLOCATION_STATUS.CANCELLED) return ALLOCATION_STATUS.CANCELLED;
  if (s === ALLOCATION_STATUS.EXPIRED) return ALLOCATION_STATUS.EXPIRED;
  return null;
}

function isTransientTransactionError(error) {
  const labels = error?.errorLabels || error?.labels;
  const hasLabel = (label) => Array.isArray(labels) && labels.includes(label);
  return hasLabel("TransientTransactionError") || hasLabel("UnknownTransactionCommitResult");
}

async function withTransactionRetry({ session, fn, maxRetries = 3 }) {
  const max = Number.isFinite(maxRetries) && maxRetries > 0 ? Math.floor(maxRetries) : 1;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      return await session.withTransaction(fn);
    } catch (error) {
      const canRetry = attempt < max && isTransientTransactionError(error);
      if (!canRetry) throw error;
    }
  }
  // Should never reach here
  throw createHttpError(500, "Transaction retry loop exhausted");
}

async function safeAuditLog(entry) {
  try {
    await logAction(entry);
  } catch (_) {
    // logAction already protects itself; this is a second safety net.
  }
}

function isAllocationExpired(allocation, now = new Date()) {
  if (!allocation) return false;
  if (allocation.status !== ALLOCATION_STATUS.ACTIVE) return false;
  const end = allocation.endDate instanceof Date ? allocation.endDate : parseIsoDateStrict(allocation.endDate);
  if (!end) return false;
  return end.getTime() < now.getTime();
}

async function expireAllocations({ libraryId, now = new Date(), limit = 500 } = {}) {
  if (!libraryId) throw createHttpError(400, "libraryId is required");
  const cutoff = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(cutoff.getTime())) throw createHttpError(400, "Invalid now");

  const batchLimit = Math.min(parsePositiveInt(limit, 500), 5000);
  let totalMatched = 0;
  let totalModified = 0;

  // Cron-safe batching:
  // - Cursor-based iteration to guarantee forward progress
  // - Hard max batches to avoid infinite loops in pathological cases
  const maxBatches = Math.max(1, Math.ceil(20000 / Math.max(1, batchLimit)));
  let lastEndDate = null;
  let lastId = null;
  let batches = 0;
  let stalledBatches = 0;

  while (batches < maxBatches) {
    batches += 1;

    const baseFilter = { libraryId, status: ALLOCATION_STATUS.ACTIVE, endDate: { $lt: cutoff } };
    const cursorFilter =
      lastEndDate && lastId
        ? {
            $or: [
              { endDate: { $gt: lastEndDate, $lt: cutoff } },
              { endDate: lastEndDate, _id: { $gt: lastId } },
            ],
          }
        : {};

    const ids = await SeatAllocation.find({ ...baseFilter, ...cursorFilter }, { _id: 1, endDate: 1 })
      .sort({ endDate: 1, _id: 1 })
      .limit(batchLimit)
      .lean();

    if (!ids.length) break;
    const idList = ids.map((d) => d._id);
    const last = ids[ids.length - 1];
    lastEndDate = last?.endDate ?? lastEndDate;
    lastId = last?._id ?? lastId;

    const result = await SeatAllocation.updateMany(
      { _id: { $in: idList }, libraryId, status: ALLOCATION_STATUS.ACTIVE },
      { status: ALLOCATION_STATUS.EXPIRED }
    );

    totalMatched += result?.matchedCount ?? 0;
    totalModified += result?.modifiedCount ?? 0;

    if ((result?.modifiedCount ?? 0) === 0) {
      stalledBatches += 1;
      if (stalledBatches >= 2) {
        // Avoid endless reprocessing if records are not changing as expected (race/permissions/etc).
        break;
      }
    } else {
      stalledBatches = 0;
    }

    if (ids.length < batchLimit) break;
  }

  return { matchedCount: totalMatched, modifiedCount: totalModified };
}

async function listAllocations({ user, query }) {
  const libraryId = user.libraryId;
  const shiftId = String(query.shiftId || "").trim();
  const spaceId = String(query.spaceId || "").trim();
  const filter = { libraryId, status: ALLOCATION_STATUS.ACTIVE };

  if (shiftId) filter.shiftId = requireObjectId(shiftId, "Invalid shiftId");
  if (spaceId) {
    const validSpaceId = requireObjectId(spaceId, "Invalid spaceId");
    const seatIds = await Seat.distinct("_id", { libraryId, spaceId: validSpaceId });
    if (!seatIds.length) return [];
    filter.seatId = { $in: seatIds };
  }

  const pagination = getPagination(query);
  const includeTotal = String(query?.includeTotal || "").trim() === "1";

  const q = SeatAllocation.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .populate(POPULATE.seat)
    .populate(POPULATE.shift)
    .populate(POPULATE.student);
  if (pagination.shouldPaginate) q.skip(pagination.skip).limit(pagination.limit);

  const [list, total] = await Promise.all([
    q.lean(),
    includeTotal && pagination.shouldPaginate ? SeatAllocation.countDocuments(filter) : Promise.resolve(null),
  ]);

  const data = list.map(toAllocationResponse);
  if (!includeTotal) return data;
  if (!pagination.shouldPaginate) return data;

  // Opt-in metadata mode (does not affect existing callers unless includeTotal=1 is passed)
  return {
    data,
    page: pagination.page,
    limit: pagination.limit,
    total,
  };
}

async function createAllocation({ user, body }) {
  const libraryId = user.libraryId;
  const seatId = requireObjectId(body?.seatId, "Invalid seatId");
  const shiftId = requireObjectId(body?.shiftId, "Invalid shiftId");
  const studentId = requireObjectId(body?.studentId, "Invalid studentId");
  const startDate = parseIsoDateStrict(body?.startDate);
  const endDate = parseIsoDateStrict(body?.endDate);
  if (!startDate || !endDate) throw createHttpError(400, "Invalid startDate/endDate");
  if (endDate.getTime() <= startDate.getTime()) throw createHttpError(400, "endDate must be after startDate");
  if (endDate.getTime() - startDate.getTime() > MAX_ALLOCATION_DURATION_MS) {
    throw createHttpError(400, `Allocation duration exceeds max allowed (${MAX_ALLOCATION_DURATION_DAYS} days)`);
  }

  const session = await mongoose.startSession();
  let createdId = null;
  try {
    await withTransactionRetry({
      session,
      fn: async () => {
      const [seat, shift, student] = await Promise.all([
        Seat.findOne({ _id: seatId, libraryId }).session(session).lean(),
        Shift.findOne({ _id: shiftId, libraryId }).session(session).lean(),
        Student.findOne({ _id: studentId, libraryId, isDeleted: false }).session(session).lean(),
      ]);
      if (!seat) throw createHttpError(404, "Seat not found");
      if (!shift) throw createHttpError(404, "Shift not found");
      if (!student) throw createHttpError(404, "Student not found");

      const seatConflict = await SeatAllocation.findOne({
        libraryId,
        seatId,
        status: ALLOCATION_STATUS.ACTIVE,
        ...buildDateOverlapFilter(startDate, endDate),
      })
        .session(session)
        .select({ _id: 1 })
        .lean();
      if (seatConflict) {
        throw createHttpError(409, "Seat already allocated for overlapping date range");
      }

      const studentShiftConflict = await SeatAllocation.findOne({
        libraryId,
        studentId,
        shiftId,
        status: ALLOCATION_STATUS.ACTIVE,
        ...buildDateOverlapFilter(startDate, endDate),
      })
        .session(session)
        .select({ _id: 1 })
        .lean();
      if (studentShiftConflict) {
        throw createHttpError(409, "Student already has an active allocation for this shift in overlapping date range");
      }

      const created = await SeatAllocation.create(
        [
          {
            libraryId,
            seatId,
            shiftId,
            studentId,
            startDate,
            endDate,
            status: ALLOCATION_STATUS.ACTIVE,
          },
        ],
        { session }
      );
      createdId = created?.[0]?._id?.toString?.() || null;
      },
    });
  } finally {
    try {
      await session.endSession();
    } catch (_) {
      // Best-effort cleanup; never hide the original error.
    }
  }

  const createdPopulated = await SeatAllocation.findOne({ _id: createdId, libraryId })
    .populate(POPULATE.seat)
    .populate(POPULATE.shift)
    .populate(POPULATE.student)
    .lean();
  if (!createdPopulated) throw createHttpError(500, "Allocation created but could not be fetched");

  await safeAuditLog({
    action: "seat_allocation.create",
    userId: user?._id || user?.id || null,
    role: user?.role || null,
    libraryId,
    metadata: { allocationId: createdId, seatId, shiftId, studentId },
  });

  return toAllocationResponse(createdPopulated);
}

async function cancelAllocation({ user, params, body }) {
  const id = requireObjectId(params.id, "Invalid allocation id");
  const status = normalizeAllocationStatus(body?.status);
  if (status !== ALLOCATION_STATUS.CANCELLED)
    throw createHttpError(400, "Only status=cancelled is supported");

  const updated = await SeatAllocation.findOneAndUpdate(
    { _id: id, libraryId: user.libraryId, status: ALLOCATION_STATUS.ACTIVE },
    { status: ALLOCATION_STATUS.CANCELLED },
    { new: true }
  )
    .populate(POPULATE.seat)
    .populate(POPULATE.shift)
    .populate(POPULATE.student)
    .lean();
  if (!updated) {
    const existing = await SeatAllocation.findOne({ _id: id, libraryId: user.libraryId })
      .select({ status: 1 })
      .lean();
    if (!existing) throw createHttpError(404, "Allocation not found");
    if (existing.status === ALLOCATION_STATUS.CANCELLED) {
      throw createHttpError(409, "Allocation already cancelled");
    }
    if (existing.status === ALLOCATION_STATUS.EXPIRED) {
      throw createHttpError(409, "Allocation already expired");
    }
    throw createHttpError(409, "Allocation cannot be cancelled");
  }

  await safeAuditLog({
    action: "seat_allocation.cancel",
    userId: user?._id || user?.id || null,
    role: user?.role || null,
    libraryId: user.libraryId,
    metadata: { allocationId: id },
  });

  return toAllocationResponse(updated);
}

module.exports = {
  listAllocations,
  createAllocation,
  cancelAllocation,
  // Additive exports for cron/maintenance jobs (no API changes)
  isAllocationExpired,
  expireAllocations,
};
