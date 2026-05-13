const mongoose = require("mongoose");
const {
  KNOWN_PLACEHOLDER_KEYS,
  extractPlaceholderKeys,
  validatePlaceholderSyntax,
  validateDraftOrMessage,
  renderPublishedTemplate,
} = require("../utils/templateRender");

const TEMPLATE_TYPES = [
  "system",
  "custom",
];

const TEMPLATE_CHANNELS = [
  "sms",
  "whatsapp",
  "email",
];

const templateSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Library",
      default: null,
      immutable: true,
      required() {
        return this.type === "custom";
      },
    },

    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 120,
      match: [
        /^[a-z0-9][a-z0-9._\s-]{0,118}[a-z0-9]$|^[a-z0-9]$/,
        "Invalid template name",
      ],
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
      validate: [
        validatePlaceholderSyntax,
        "Placeholders must look like {name} with lowercase snake_case identifiers only",
      ],
    },

    /** Optional unpublished body (draft/publish workflow). Same placeholder rules as message. */
    draftMessage: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: undefined,
      validate: [
        validateDraftOrMessage,
        "draftMessage placeholders must use lowercase snake_case tokens",
      ],
    },

    /** Published content is active for rendering/API; draft keeps work-in-progress only. */
    publishStatus: {
      type: String,
      enum: ["published", "draft"],
      default: "published",
    },

    /** Declared placeholders for validation / future UI (optional; derived if empty). */
    variables: {
      type: [String],
      default: undefined,
      validate: {
        validator(arr) {
          if (!arr?.length) return true;
          return arr.every(
            (k) =>
              typeof k === "string" &&
              /^[a-z][a-z0-9_]*$/.test(k) &&
              k.length <= 64
          );
        },
        message: "variables must be lowercase snake_case identifiers",
      },
    },

    type: {
      type: String,
      enum: TEMPLATE_TYPES,
      required: true,
      default: "custom",
    },

    channel: {
      type: String,
      enum: TEMPLATE_CHANNELS,
      default: "sms",
    },

    locked: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /** Soft-archive prep: when set, treat as archived alongside isActive false. */
    archivedAt: {
      type: Date,
      default: null,
    },

    /** Billing / product grouping for large catalogs. */
    category: {
      type: String,
      default: "general",
      trim: true,
      lowercase: true,
      maxlength: 64,
    },

    locale: {
      type: String,
      default: "en",
      trim: true,
      lowercase: true,
      maxlength: 16,
      match: /^[a-z]{2}(-[a-z]{2})?$/,
    },

    /** Increments when name or message changes (document save + findOneAndUpdate path). */
    contentVersion: {
      type: Number,
      default: 1,
      min: 1,
    },

    /** When true, unknown {placeholder} keys fail validation (opt-in). */
    placeholderStrict: {
      type: Boolean,
      default: false,
    },

    /** Delivery analytics (increment via recordDeliveryOutcome). */
    usageStats: {
      type: new mongoose.Schema(
        {
          sentCount: { type: Number, default: 0, min: 0 },
          failedCount: { type: Number, default: 0, min: 0 },
          lastSentAt: { type: Date, default: null },
          lastAttemptAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },

    /** Provider idempotency keys, retry tokens, last error summary (not exposed in JSON). */
    providerMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator(v) {
          if (v == null) return true;
          if (typeof v !== "object" || Array.isArray(v)) return false;
          try {
            return JSON.stringify(v).length <= 4096;
          } catch {
            return false;
          }
        },
        message: "providerMeta must be a plain object under 4KB serialized",
      },
    },

    /** Last N published bodies for audit (cap enforced on push). Omitted from default API JSON. */
    revisionSnapshots: {
      type: [
        new mongoose.Schema(
          {
            contentVersion: { type: Number, required: true, min: 1 },
            name: { type: String, required: true },
            message: { type: String, required: true },
            capturedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: undefined,
      validate: {
        validator(arr) {
          return !arr || arr.length <= 50;
        },
        message: "revisionSnapshots may contain at most 50 entries",
      },
    },

    /** Bounded integration / audit payload; stripped in JSON. */
    auditMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator(v) {
          if (v == null) return true;
          if (typeof v !== "object" || Array.isArray(v)) return false;
          try {
            return JSON.stringify(v).length <= 8192;
          } catch {
            return false;
          }
        },
        message: "auditMeta must be a plain object under 8KB serialized",
      },
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.auditMeta;
        delete ret.providerMeta;
        delete ret.revisionSnapshots;
        delete ret.draftMessage;
        return ret;
      },
    },
    toObject: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.auditMeta;
        delete ret.providerMeta;
        delete ret.revisionSnapshots;
        delete ret.draftMessage;
        return ret;
      },
    },
  }
);

templateSchema.set("strictQuery", true);

templateSchema.pre("validate", function (next) {
  if (this.type === "system") {
    this.libraryId = null;
    this.locked = true;
  }

  if (this.type === "custom" && !this.libraryId) {
    this.invalidate("libraryId", "Custom templates require libraryId");
  }

  if (this.archivedAt && this.isActive) {
    this.invalidate("isActive", "Archived templates must have isActive false");
  }

  const keysFromMsg = extractPlaceholderKeys(this.message || "");
  const keysFromDraft = this.draftMessage
    ? extractPlaceholderKeys(this.draftMessage)
    : new Set();

  if (this.variables?.length) {
    const declared = new Set(this.variables);
    for (const k of keysFromMsg) {
      if (!declared.has(k)) {
        this.invalidate(
          "variables",
          `Message contains {${k}} which is not listed in variables`
        );
        break;
      }
    }
    for (const k of keysFromDraft) {
      if (!declared.has(k)) {
        this.invalidate(
          "variables",
          `Draft contains {${k}} which is not listed in variables`
        );
        break;
      }
    }
  }

  if (this.placeholderStrict) {
    for (const k of keysFromMsg) {
      if (!KNOWN_PLACEHOLDER_KEYS.has(k)) {
        this.invalidate(
          "message",
          `Unknown placeholder {${k}} (placeholderStrict is enabled)`
        );
        break;
      }
    }
    for (const k of keysFromDraft) {
      if (!KNOWN_PLACEHOLDER_KEYS.has(k)) {
        this.invalidate(
          "draftMessage",
          `Unknown placeholder {${k}} in draft (placeholderStrict is enabled)`
        );
        break;
      }
    }
  }

  next();
});

templateSchema.pre("save", function (next) {
  if (!this.isNew && (this.isModified("message") || this.isModified("name"))) {
    this.set("contentVersion", (this.contentVersion || 1) + 1);
  }
  next();
});

/** Block mutations/deletes on system or locked templates at the model layer. */
async function guardLockedTemplateWrite(queryMiddleware) {
  const filter = queryMiddleware.getFilter();
  const doc = await queryMiddleware.model
    .findOne(filter)
    .select("type locked libraryId")
    .lean();
  if (!doc) return;

  const op = queryMiddleware.op;
  if (op === "findOneAndDelete" || op === "deleteOne") {
    if (doc.type === "system" || doc.locked) {
      throw new Error("Cannot delete system or locked templates");
    }
    return;
  }

  const raw = queryMiddleware.getUpdate() || {};
  const set = raw.$set && typeof raw.$set === "object" ? raw.$set : null;
  const flatKeys = set
    ? Object.keys(set)
    : typeof raw === "object" && raw && !raw.$set
      ? Object.keys(raw).filter((k) => !k.startsWith("$"))
      : [];

  const touchesContent =
    set &&
    (Object.prototype.hasOwnProperty.call(set, "message") ||
      Object.prototype.hasOwnProperty.call(set, "name") ||
      Object.prototype.hasOwnProperty.call(set, "draftMessage"));

  if (doc.type === "system") {
    const forbiddenMeta = flatKeys.some((k) =>
      ["type", "libraryId", "locked", "channel"].includes(k)
    );
    if (forbiddenMeta) {
      throw new Error("Cannot change protected fields on system templates");
    }
  }

  if (doc.locked && doc.type === "custom" && touchesContent) {
    throw new Error("Cannot modify locked template content");
  }

  if (op === "findOneAndReplace") {
    const rep = queryMiddleware.getUpdate();
    if (doc.type === "system" || doc.locked) {
      throw new Error("Cannot replace system or locked templates");
    }
    if (rep && typeof rep === "object" && rep.type === "system") {
      throw new Error("Cannot set type system via replace");
    }
  }
}

templateSchema.pre("findOneAndUpdate", async function () {
  await guardLockedTemplateWrite(this);
});

templateSchema.pre("findOneAndReplace", async function () {
  await guardLockedTemplateWrite(this);
});

templateSchema.pre("deleteOne", async function () {
  await guardLockedTemplateWrite(this);
});

templateSchema.pre("findOneAndDelete", async function () {
  await guardLockedTemplateWrite(this);
});

function bumpContentVersionOnUpdate() {
  const update = this.getUpdate();
  if (!update || typeof update !== "object") return;
  const set = update.$set;
  const touches =
    (set &&
      (Object.prototype.hasOwnProperty.call(set, "message") ||
        Object.prototype.hasOwnProperty.call(set, "name"))) ||
    Object.prototype.hasOwnProperty.call(update, "message") ||
    Object.prototype.hasOwnProperty.call(update, "name");
  if (touches) {
    update.$inc = update.$inc || {};
    update.$inc.contentVersion = 1;
  }
}

templateSchema.pre("findOneAndUpdate", bumpContentVersionOnUpdate);

/**
 * Atomic usage counters for omnichannel send pipelines (success vs failure).
 */
templateSchema.statics.recordDeliveryOutcome = async function recordDeliveryOutcome(
  templateId,
  { ok }
) {
  const incField = ok ? "usageStats.sentCount" : "usageStats.failedCount";
  await this.updateOne(
    { _id: templateId },
    {
      $inc: { [incField]: 1 },
      $set: {
        "usageStats.lastAttemptAt": new Date(),
        ...(ok ? { "usageStats.lastSentAt": new Date() } : {}),
      },
    }
  );
};

/**
 * Append a revision snapshot (last 50 retained). Call before destructive edits if you need history.
 */
templateSchema.statics.appendRevisionSnapshot = async function appendRevisionSnapshot(
  templateId,
  snapshot
) {
  await this.updateOne(
    { _id: templateId },
    {
      $push: {
        revisionSnapshots: {
          $each: [snapshot],
          $slice: -50,
        },
      },
    }
  );
};

/** Render published `message` with placeholders replaced + channel sanitization. */
templateSchema.statics.renderPublishedMessage = function renderPublishedMessage(
  doc,
  variables,
  options
) {
  return renderPublishedTemplate(doc, variables, options);
};

/** Custom templates: unique name per tenant (existing behavior). */
templateSchema.index(
  { libraryId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "custom",
    },
  }
);

/** System templates: globally unique name among system rows. */
templateSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "system",
    },
  }
);

templateSchema.index({ libraryId: 1, type: 1, isActive: 1, name: 1 });

templateSchema.index({ type: 1, category: 1, locale: 1 });

templateSchema.index({ libraryId: 1, channel: 1, isActive: 1 });

templateSchema.index({ libraryId: 1, publishStatus: 1 });

templateSchema.index({
  name: "text",
  message: "text",
  category: "text",
});

/** Active tenant-visible templates (custom). */
templateSchema.statics.filterLibraryActiveCustom =
  function filterLibraryActiveCustom(libraryId) {
    return {
      type: "custom",
      libraryId,
      isActive: true,
      archivedAt: null,
    };
  };

/** System + one tenant's custom (same shape as list API). */
templateSchema.statics.filterTenantListing = function filterTenantListing(
  libraryId
) {
  return {
    $or: [{ type: "system" }, { type: "custom", libraryId }],
  };
};

module.exports = mongoose.model(
  "Template",
  templateSchema
);
