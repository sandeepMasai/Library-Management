const express = require("express");
const mongoose = require("mongoose");
const Template = require("../models/Template");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../middleware/subscription.middleware");

const router = express.Router();

function toTemplateRow(t) {
  const stats = t.usageStats || {};
  return {
    id: t._id.toString(),
    name: t.name,
    message: t.message,
    type: t.type,
    isSystem: t.type === "system",
    locked: Boolean(t.locked),
    channel: t.channel || "sms",
    isActive: t.isActive !== false,
    category: t.category || "general",
    locale: t.locale || "en",
    contentVersion: Number(t.contentVersion) || 1,
    publishStatus: t.publishStatus || "published",
    hasDraft: Boolean(t.draftMessage),
    usage: {
      sentCount: Number(stats.sentCount) || 0,
      failedCount: Number(stats.failedCount) || 0,
      lastSentAt: stats.lastSentAt?.toISOString?.() || null,
    },
    createdAt: t.createdAt?.toISOString?.() || null,
    updatedAt: t.updatedAt?.toISOString?.() || null,
  };
}

async function ensureSystemTemplatesExist() {
  const count = await Template.countDocuments({ type: "system" });
  if (count > 0) return;
  await Template.insertMany([
    {
      type: "system",
      locked: true,
      name: "Fee Reminder",
      message: "Hello {student_name}, your fee of ₹{amount} is pending. Please pay before {due_date}. - {library_name}",
      libraryId: null,
    },
    {
      type: "system",
      locked: true,
      name: "Welcome Message",
      message: "Welcome {student_name} to {library_name}. Your membership is active until {due_date}.",
      libraryId: null,
    },
  ]);
}

/**
 * GET /api/templates
 *
 * Returns:
 * - system templates (shared)
 * - custom templates for current library
 */
router.get("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, async (req, res) => {
  try {
    await ensureSystemTemplatesExist();
    const libraryId = String(req.user?.libraryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(libraryId)) return res.status(400).json({ message: "Invalid library account" });

    const list = await Template.find({
      $or: [{ type: "system" }, { type: "custom", libraryId }],
    })
      .sort({ type: 1, name: 1 })
      .lean();

    return res.json({ ok: true, templates: list.map(toTemplateRow) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Template name already exists" });
    }
    return res.status(500).json({ message: "Failed to load templates", error: error.message });
  }
});

/**
 * POST /api/templates
 *
 * Create a custom template.
 */
router.post("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, async (req, res) => {
  try {
    const libraryId = String(req.user?.libraryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(libraryId)) return res.status(400).json({ message: "Invalid library account" });

    const name = String(req.body?.name || "").trim();
    const message = String(req.body?.message || "").trim();
    if (!name || !message) return res.status(400).json({ message: "name and message are required" });

    const created = await Template.create({
      libraryId,
      name,
      message,
      type: "custom",
      locked: false,
    });

    return res.status(201).json({ ok: true, template: toTemplateRow(created) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Template name already exists" });
    }
    return res.status(500).json({ message: "Failed to create template", error: error.message });
  }
});

/**
 * PUT /api/templates/:id
 *
 * Update a custom template (system templates are locked).
 */
router.put("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, async (req, res) => {
  try {
    const libraryId = String(req.user?.libraryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(libraryId)) return res.status(400).json({ message: "Invalid library account" });

    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid template id" });

    const name = String(req.body?.name || "").trim();
    const message = String(req.body?.message || "").trim();
    if (!name || !message) return res.status(400).json({ message: "name and message are required" });

    const existing = await Template.findById(id).lean();
    if (!existing) return res.status(404).json({ message: "Template not found" });
    if (existing.type === "system" || existing.locked) {
      return res.status(403).json({ message: "System templates are locked" });
    }
    if (String(existing.libraryId) !== libraryId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await Template.findByIdAndUpdate(
      id,
      { $set: { name, message } },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ ok: true, template: toTemplateRow(updated) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Template name already exists" });
    }
    return res.status(500).json({ message: "Failed to update template", error: error.message });
  }
});

/**
 * DELETE /api/templates/:id
 *
 * Delete a custom template (system templates are locked).
 */
router.delete("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, async (req, res) => {
  try {
    const libraryId = String(req.user?.libraryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(libraryId)) return res.status(400).json({ message: "Invalid library account" });

    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid template id" });

    const existing = await Template.findById(id).lean();
    if (!existing) return res.status(404).json({ message: "Template not found" });
    if (existing.type === "system" || existing.locked) {
      return res.status(403).json({ message: "System templates are locked" });
    }
    if (String(existing.libraryId) !== libraryId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await Template.deleteOne({ _id: id });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete template", error: error.message });
  }
});

module.exports = router;

