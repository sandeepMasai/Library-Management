const mongoose = require("mongoose");

const PLANS = ["free", "pro"];

function generateLibraryCodeCandidate(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for readability
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function generateUniqueLibraryCode(model) {
  // 5–8 chars, uppercase, unique
  for (let attempt = 0; attempt < 20; attempt++) {
    const length = 5 + (attempt % 4); // 5..8
    const code = generateLibraryCodeCandidate(length).toUpperCase();
    // eslint-disable-next-line no-await-in-loop
    const exists = await model.exists({ libraryCode: code });
    if (!exists) return code;
  }
  // Fallback (still short-ish) if collisions are extreme
  return `LIB${Date.now().toString(36).toUpperCase()}`.slice(0, 8);
}

const librarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    logoUrl: { type: String, default: null, trim: true },
    // Subscription fields:
    // - "free" is a limited plan (used as Free Trial on registration; can later be used as downgraded limited plan)
    // - "pro" unlocks paid features
    plan: { type: String, enum: PLANS, default: "free" },
    planStartDate: { type: Date, default: Date.now },
    // If null: plan does not expire (used after downgrade to free limited plan).
    planExpiryDate: { type: Date, default: null },
    libraryCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes are already created by `unique: true` on the schema fields.

librarySchema.pre("validate", async function preValidate(next) {
  try {
    if (!this.libraryCode) {
      this.libraryCode = await generateUniqueLibraryCode(this.constructor);
    } else {
      this.libraryCode = String(this.libraryCode).trim().toUpperCase();
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model("Library", librarySchema);

