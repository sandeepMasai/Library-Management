const User = require("../models/User");

/** Default RBAC tags for future fine-grained checks (middleware can evolve without schema churn). */
const ROLE_DEFAULT_PERMISSIONS = {
  admin: ["admin.*", "audit.read"],
  library: ["library.*", "tenant.self"],
  student: ["student.self"],
  staff: ["staff.*", "tenant.scoped"],
};

function defaultPermissionsForRole(role) {
  return [...(ROLE_DEFAULT_PERMISSIONS[role] || [])];
}

/**
 * Upsert central User row after successful login. JWT `userId` stays equal to
 * existing API ids (library._id, student._id, or "admin-1") via User.subjectKey.
 */
async function recordLibraryIdentity(library) {
  if (!library?._id) return null;
  const subjectKey = String(library._id);
  return User.findOneAndUpdate(
    { subjectKey },
    {
      $set: {
        role: "library",
        authSource: "library",
        libraryId: library._id,
        studentId: null,
        email: library.email || null,
        mobile: library.phone || null,
        isActive: library.isActive !== false,
        accountStatus: library.isActive !== false ? "active" : "deactivated",
        lastLoginAt: new Date(),
      },
      $setOnInsert: {
        subjectKey,
        permissions: defaultPermissionsForRole("library"),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

async function recordStudentIdentity(student) {
  if (!student?._id) return null;
  const subjectKey = String(student._id);
  return User.findOneAndUpdate(
    { subjectKey },
    {
      $set: {
        role: "student",
        authSource: "student",
        libraryId: student.libraryId,
        studentId: student._id,
        mobile: student.mobile || null,
        email: null,
        isActive: !student.isBlocked,
        accountStatus: student.isBlocked ? "suspended" : "active",
        lastLoginAt: new Date(),
      },
      $setOnInsert: {
        subjectKey,
        permissions: defaultPermissionsForRole("student"),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

async function recordPlatformAdminIdentity() {
  const subjectKey = "admin-1";
  return User.findOneAndUpdate(
    { subjectKey },
    {
      $set: {
        role: "admin",
        authSource: "platform",
        libraryId: null,
        studentId: null,
        email: process.env.ADMIN_EMAIL || null,
        mobile: process.env.ADMIN_MOBILE || null,
        isActive: true,
        accountStatus: "active",
        lastLoginAt: new Date(),
      },
      $setOnInsert: {
        subjectKey,
        permissions: defaultPermissionsForRole("admin"),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

module.exports = {
  ROLE_DEFAULT_PERMISSIONS,
  defaultPermissionsForRole,
  recordLibraryIdentity,
  recordStudentIdentity,
  recordPlatformAdminIdentity,
};
