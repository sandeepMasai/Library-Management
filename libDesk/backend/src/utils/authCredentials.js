const bcrypt = require("bcryptjs");

/**
 * Central bcrypt verification for library / future User-stored passwords.
 * Student PINs remain on Student.pinHash via Student.prototype.verifyPin.
 */
async function verifyBcryptPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(String(plain).trim(), String(hash));
}

async function hashPassword(plain, rounds = 10) {
  return bcrypt.hash(String(plain).trim(), rounds);
}

module.exports = {
  verifyBcryptPassword,
  hashPassword,
};
