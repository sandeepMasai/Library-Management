const allocationService = require("../services/allocation.service");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const listAllocations = asyncHandler(async (req, res) => {
  const allocations = await allocationService.listAllocations({ user: req.user, query: req.query });
  return sendSuccess(res, allocations, "Allocations fetched successfully");
});

const createAllocation = asyncHandler(async (req, res) => {
  const allocation = await allocationService.createAllocation({ user: req.user, body: req.body });
  return sendSuccess(res, allocation, "Allocation created successfully", 201);
});

const cancelAllocation = asyncHandler(async (req, res) => {
  const allocation = await allocationService.cancelAllocation({ user: req.user, params: req.params, body: req.body });
  return sendSuccess(res, allocation, "Allocation cancelled successfully");
});

module.exports = {
  listAllocations,
  createAllocation,
  cancelAllocation,
};
