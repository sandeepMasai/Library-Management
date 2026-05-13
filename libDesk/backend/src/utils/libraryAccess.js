/**
 * Library dashboard / tenant API access: paid subscription with a valid expiry window.
 * - inactive / expired: no access
 * - cancelled: access until planExpiryDate
 */
function libraryHasOperationalAccess(lib) {
  if (!lib || lib.isActive === false) return false;

  const status = String(lib.subscriptionStatus || "")
    .trim()
    .toLowerCase();
  const expMs = lib.planExpiryDate ? new Date(lib.planExpiryDate).getTime() : null;
  const hasFutureExpiry =
    expMs != null && Number.isFinite(expMs) && Date.now() < expMs;

  if (status === "inactive") return false;
  if (status === "expired") return false;
  if (String(lib.plan || "") !== "pro") return false;
  if (!hasFutureExpiry) return false;
  if (status === "active" || status === "cancelled") return true;

  return false;
}

module.exports = { libraryHasOperationalAccess };
