const Log = require("../../models/Log");

/**
 * Best-effort log write (never blocks main flow).
 */
async function writeLog(entry) {
  try {
    await Log.create({
      action: String(entry.action || "").trim(),
      userId: entry.userId ? String(entry.userId) : null,
      role: entry.role ? String(entry.role) : null,
      libraryId: entry.libraryId || null,
      timestamp: entry.timestamp || new Date(),
    });
  } catch {
    // Non-fatal: do not crash API for logging failures
  }
}

module.exports = { writeLog };

