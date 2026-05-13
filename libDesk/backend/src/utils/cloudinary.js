const cloudinary = require("cloudinary").v2;

// Cloudinary SDK auto-reads CLOUDINARY_URL from env if set.
// Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
// If individual vars are preferred, set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET instead.
if (!process.env.CLOUDINARY_URL && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Upload a buffer to Cloudinary and return the secure URL.
 * @param {Buffer} buffer
 * @param {object} options  - extra Cloudinary upload options
 * @returns {Promise<{url: string, public_id: string}>}
 */
async function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "libdesk/students",
        transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Delete an asset from Cloudinary by its public_id.
 * @param {string} publicId
 */
async function deleteAsset(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Non-fatal
  }
}

function isCloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);
}

module.exports = { uploadBuffer, deleteAsset, isCloudinaryConfigured };
