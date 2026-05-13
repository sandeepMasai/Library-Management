const mongoose = require("mongoose");

const urlRegex = /^https?:\/\/.+/i;
const phoneRegex = /^\+?[1-9]\d{7,14}$/;

const GlobalSettingsSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: "global",
      immutable: true,
    },

    privacyPolicyUrl: {
      type: String,
      required: true,
      trim: true,
      match: urlRegex,
    },

    termsUrl: {
      type: String,
      required: true,
      trim: true,
      match: urlRegex,
    },

    communication: {
      type: {
        whatsapp: {
          type: String,
          default: null,
          trim: true,
          match: phoneRegex,
        },

        channel: {
          type: String,
          default: null,
          trim: true,
          match: urlRegex,
        },

        email: {
          type: String,
          default: null,
          trim: true,
          lowercase: true,
        },
      },

      default: () => ({}),
    },
  },
  {
    timestamps: {
      createdAt: false,
      updatedAt: true,
    },

    toJSON: {
      versionKey: false,
    },
  }
);

module.exports = mongoose.model(
  "GlobalSettings",
  GlobalSettingsSchema
);