const mongoose = require("mongoose");
const Space = require("../models/Space");
const Seat = require("../models/Seat");
const { createHttpError } = require("../utils/httpError");

function toSpaceResponse(space) {
  return {
    id: space._id.toString(),
    libraryId: space.libraryId?.toString?.() || null,
    name: space.name,
    order: space.order || 0,
  };
}

function requireSpaceId(value) {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) throw createHttpError(400, "Invalid space id");
  return id;
}

async function listSpaces({ user }) {
  const list = await Space.find({ libraryId: user.libraryId }).sort({ order: 1, createdAt: 1 }).lean();
  return list.map(toSpaceResponse);
}

async function createSpace({ user, body }) {
  const name = String(body?.name || "").trim();
  const order = Number(body?.order || 0);
  if (!name) throw createHttpError(400, "name is required");

  const created = await Space.create({ libraryId: user.libraryId, name, order: Number.isFinite(order) ? order : 0 });
  return toSpaceResponse(created);
}

async function updateSpace({ user, params, body }) {
  const id = requireSpaceId(params.id);
  const patch = {};
  if (body?.name !== undefined) {
    const name = String(body?.name || "").trim();
    if (!name) throw createHttpError(400, "name cannot be empty");
    patch.name = name;
  }
  if (body?.order !== undefined) {
    const order = Number(body?.order);
    patch.order = Number.isFinite(order) ? order : 0;
  }

  const updated = await Space.findOneAndUpdate({ _id: id, libraryId: user.libraryId }, patch, { new: true });
  if (!updated) throw createHttpError(404, "Space not found");
  return toSpaceResponse(updated);
}

async function deleteSpace({ user, params }) {
  const id = requireSpaceId(params.id);
  const inUse = await Seat.exists({ libraryId: user.libraryId, spaceId: id });
  if (inUse) throw createHttpError(409, "Cannot delete space while seats are assigned");

  const deleted = await Space.findOneAndDelete({ _id: id, libraryId: user.libraryId });
  if (!deleted) throw createHttpError(404, "Space not found");
  return { ok: true };
}

module.exports = {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
};
