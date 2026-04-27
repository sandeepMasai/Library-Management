const mongoose = require("mongoose");

/**
 * GlobalSettings
 *
 * Single-document collection for app-wide URLs/settings.
 * We enforce a single record by using a fixed string _id ("global").
 */
const GlobalSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "global" },
    privacyPolicyUrl: { type: String, required: true },
    termsUrl: { type: String, required: true },
    communication: {
      whatsapp: { type: String, default: null, trim: true }, // digits only, international
      channel: { type: String, default: null, trim: true }, // url
      email: { type: String, default: null, trim: true, lowercase: true },
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

module.exports = mongoose.model("GlobalSettings", GlobalSettingsSchema);

