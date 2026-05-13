import type { User } from '../store';

/** Mirrors backend `libraryHasOperationalAccess`: Pro + valid future expiry + active or cancelled. */
export function libraryHasActiveSubscription(user: User | null): boolean {
  if (!user || user.role !== 'library' || user.isActive === false) return false;

  const status = String(user.subscriptionStatus || '')
    .trim()
    .toLowerCase();
  const exp = user.planExpiryDate ? new Date(user.planExpiryDate).getTime() : null;
  const hasFutureExpiry = exp != null && Number.isFinite(exp) && Date.now() < exp;

  if (status === 'inactive' || status === 'expired') return false;
  if (user.plan !== 'pro') return false;
  if (!hasFutureExpiry) return false;
  return status === 'active' || status === 'cancelled';
}

export function libraryMustChoosePlan(user: User | null): boolean {
  return !libraryHasActiveSubscription(user);
}
