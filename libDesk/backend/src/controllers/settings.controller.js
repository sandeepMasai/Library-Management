const settingsService = require("../services/settings.service");
const asyncHandler = require("../utils/asyncHandler");
const { createHttpError } = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

function assertAdmin(user) {
  if (user?.role !== "admin") {
    throw createHttpError(403, "Forbidden");
  }
}

function isValidHttpUrl(input) {
  try {
    const url = new URL(String(input || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeCommunication(rawCommunication) {
  if (rawCommunication === undefined) return undefined;

  const communication = {};
  if (rawCommunication?.whatsapp !== undefined) {
    communication.whatsapp = String(rawCommunication.whatsapp || "").trim();
    const digits = communication.whatsapp.replace(/\D/g, "");
    if (digits && !/^\d{10,15}$/.test(digits)) {
      throw createHttpError(400, "Invalid communication.whatsapp (10–15 digits)");
    }
  }
  if (rawCommunication?.channel !== undefined) {
    communication.channel = String(rawCommunication.channel || "").trim();
    if (communication.channel && !isValidHttpUrl(communication.channel)) {
      throw createHttpError(400, "Invalid communication.channel");
    }
  }
  if (rawCommunication?.email !== undefined) {
    communication.email = String(rawCommunication.email || "").trim().toLowerCase();
    if (communication.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(communication.email)) {
      throw createHttpError(400, "Invalid communication.email");
    }
  }

  return communication;
}

function sanitizeSettingsBody(body = {}) {
  const hasAllowedField =
    body.privacyPolicyUrl !== undefined ||
    body.termsUrl !== undefined ||
    body.communication !== undefined;

  if (!hasAllowedField) {
    throw createHttpError(400, "No settings fields provided");
  }

  const privacyPolicyUrl = String(body.privacyPolicyUrl || "").trim();
  const termsUrl = String(body.termsUrl || "").trim();
  if (!privacyPolicyUrl) throw createHttpError(400, "privacyPolicyUrl is required");
  if (!termsUrl) throw createHttpError(400, "termsUrl is required");
  if (!isValidHttpUrl(privacyPolicyUrl)) throw createHttpError(400, "Invalid privacyPolicyUrl");
  if (!isValidHttpUrl(termsUrl)) throw createHttpError(400, "Invalid termsUrl");

  return {
    privacyPolicyUrl,
    termsUrl,
    ...(body.communication !== undefined ? { communication: sanitizeCommunication(body.communication) } : {}),
  };
}

const getSettings = asyncHandler(async (req, res) => {
  assertAdmin(req.user);
  const settings = await settingsService.getSettings();
  return sendSuccess(res, settings, "Settings fetched successfully");
});

const updateSettings = asyncHandler(async (req, res) => {
  assertAdmin(req.user);
  const settings = await settingsService.updateSettings({ body: sanitizeSettingsBody(req.body) });
  return sendSuccess(res, settings, "Settings updated successfully");
});

module.exports = {
  getSettings,
  updateSettings,
};
