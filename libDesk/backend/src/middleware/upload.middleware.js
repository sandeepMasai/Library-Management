const multer = require("multer");
const path = require("path");
const { createHttpError } = require("../utils/httpError");

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function getSafeExtension(filename) {
  return path.extname(String(filename || "")).toLowerCase();
}

function validateImageFile(file) {
  const mimetype = String(file?.mimetype || "").toLowerCase();
  const extension = getSafeExtension(file?.originalname);

  if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    throw createHttpError(400, "Only JPEG, PNG, and WebP images are allowed");
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw createHttpError(400, "Invalid image file extension");
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    try {
      validateImageFile(file);
      cb(null, true);
    } catch (error) {
      cb(error, false);
    }
  },
});

module.exports = upload;
