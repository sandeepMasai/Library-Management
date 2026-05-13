import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subColors, subRadius, subShadow, subSpacing } from '../../ui/subscriptionTheme';
import { useAppStore } from '../../store';
import { apiGet, apiPost, type ApiError } from '../../services/api';
import { useNavigation } from '@react-navigation/native';

type PlanRow = {
  id: string;
  key: 'trial' | 'monthly' | '6month' | 'yearly';
  name: string;
  price: number;
  discount: number;
  finalPrice: number;
  duration: number;
  isActive: boolean;
  tag?: string | null;
};

function formatSubscriptionDateEnIn(iso: string | null | undefined): string {
  const raw = iso == null ? '' : String(iso).trim();
  if (!raw) return '--';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatExpiryForLibrary(iso: string | null | undefined, plan: 'none' | 'pro'): string {
  const raw = iso == null ? '' : String(iso).trim();
  if (!raw) {
    if (plan === 'none') return '—';
    return '--';
  }
  return formatSubscriptionDateEnIn(raw);
}

/**
 * Subscription screen
 *
 * Premium UI (no backend logic yet)
 * - Dark premium design
 * - Trial countdown timer (dynamic, updates every second)
 * - Feature list cards
 * - Plan selection (yearly/monthly) with best value highlight
 * - CTA button
 */
export default function SubscriptionScreen() {
  const navigation = useNavigation<any>();
  const currentUser = useAppStore((s) => s.currentUser);
  const cancelSubscription = useAppStore((s) => s.cancelSubscription);
  const saveRetentionChoice = useAppStore((s) => s.saveRetentionChoice);

  // Subscription period (from backend /api/subscription/me + login).
  const planStartDate = currentUser?.planStartDate ?? null;
  const expiryDate = currentUser?.planExpiryDate ?? null;
  const plan = (currentUser?.plan || 'none') as 'none' | 'pro';
  const subStatus = currentUser?.subscriptionStatus || 'inactive';
  const trialUsed = Boolean((currentUser as any)?.trialUsed);
  // Backend should provide currentPlanKey (trial/monthly/6month/yearly). Keep a safe fallback so UI never loses tick.
  const currentPlanKeyRaw = (currentUser as any)?.currentPlanKey as PlanRow['key'] | undefined;

  const [tick, setTick] = useState(0);
  const [upgrading, setUpgrading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  // Legacy (old) plan state removed; selection is now by plan id from /api/plans.
  const [payBusy, setPayBusy] = useState(false);

  // Razorpay native checkout requires a custom dev client / prebuild (not Expo Go).
  let RazorpayCheckout: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-razorpay');
    RazorpayCheckout = mod?.default ?? mod;
  } catch {
    RazorpayCheckout = null;
  }

  // Update countdown every second
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const hasValidExpiry = useMemo(() => {
    if (expiryDate == null || String(expiryDate).trim() === '') return false;
    const end = new Date(expiryDate).getTime();
    return Number.isFinite(end);
  }, [expiryDate]);

  /** One-line summary under "Subscription period" (en-IN dates). */
  const subscriptionPeriodSummary = useMemo(() => {
    if (plan === 'none' && !hasValidExpiry) return 'Complete payment below to activate your period';
    const joinStr = formatSubscriptionDateEnIn(planStartDate);
    const joinOk = joinStr !== '--';
    if (joinOk && hasValidExpiry) {
      return `${joinStr} – ${formatSubscriptionDateEnIn(expiryDate)}`;
    }
    if (joinOk) return `From ${joinStr}`;
    if (hasValidExpiry) return `Until ${formatSubscriptionDateEnIn(expiryDate)}`;
    return null;
  }, [planStartDate, expiryDate, plan, hasValidExpiry]);

  const remaining = useMemo(() => {
    if (!hasValidExpiry || !expiryDate) return { h: 0, m: 0, s: 0 };
    const end = new Date(expiryDate).getTime();
    const ms = Math.max(0, (Number.isFinite(end) ? end : 0) - Date.now());
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryDate, hasValidExpiry, tick]);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  // Selected plan key (syncs with backend's current plan type).
  const [selectedPlan, setSelectedPlan] = useState<PlanRow['key'] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Sync latest subscription status (handles auto-expire downgrade on backend).
        try {
          const me = await apiGet<{ ok: boolean; user?: any }>(`/api/subscription/me`);
          if (me?.user) useAppStore.setState({ currentUser: me.user });
        } catch {
          // ignore
        }
        const res = await apiGet<{ ok: boolean; plans: any[] }>(`/api/plans`);
        if (!alive) return;
        const rows: PlanRow[] = (res?.plans || []).map((p: any) => ({
          id: String(p._id),
          key: String(p.key) as any,
          name: String(p.name),
          price: Number(p.price || 0),
          discount: Number(p.discount || 0),
          finalPrice: Number(p.finalPrice || 0),
          duration: Number(p.duration || 0),
          isActive: Boolean(p.isActive),
          tag: p.tag ?? null,
        }));
        setPlans(rows);
        if (!selectedPlan && rows.length) setSelectedPlan(rows[0].key);
      } catch {
        // ignore; UI will show empty
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto refresh subscription status every 10s so payments reflect without going back.
  useEffect(() => {
    let alive = true;
    const t = setInterval(async () => {
      try {
        const me = await apiGet<{ ok: boolean; user?: any }>(`/api/subscription/me`);
        if (!alive) return;
        if (me?.user) useAppStore.setState({ currentUser: me.user });
      } catch {
        // ignore
      }
    }, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const isActiveUntilExpiry = useMemo(() => {
    const end = expiryDate ? new Date(expiryDate).getTime() : null;
    if (!end || !Number.isFinite(end)) return false;
    return Date.now() < end;
  }, [expiryDate]);

  // Treat a paid plan as active if:
  // - status is active
  // - expiry is in the future
  // - and currentPlanKey indicates a paid tier (trial/monthly/6month/yearly)
  const paidPlanKey =
    currentPlanKeyRaw === 'trial' ||
    currentPlanKeyRaw === 'monthly' ||
    currentPlanKeyRaw === '6month' ||
    currentPlanKeyRaw === 'yearly'
      ? currentPlanKeyRaw
      : null;
  // If currentPlanKey is missing but backend says plan is PRO and it's still within expiry,
  // fallback to monthly so UI can still show "Current Plan" / tick.
  const effectivePaidPlanKey =
    paidPlanKey || (plan === 'pro' && isActiveUntilExpiry && subStatus === 'active' ? 'monthly' : null);
  const hasActiveProAccess = Boolean(effectivePaidPlanKey && isActiveUntilExpiry && subStatus === 'active');

  // If currentPlanKey is missing but backend says plan is pro, default to monthly so UI can still show a tick.
  const currentPlanKey = hasActiveProAccess ? effectivePaidPlanKey : currentPlanKeyRaw;
  const activePlanKey = hasActiveProAccess ? (currentPlanKey ?? null) : null;
  const isExpired = subStatus === 'expired';
  const isInactive = subStatus === 'inactive';
  const canCancel =
    !isExpired && !isInactive && Boolean(expiryDate) && (hasActiveProAccess || plan === 'pro' || subStatus === 'cancelled');

  // Plan change rule:
  // - If user currently has an active PRO subscription (even if cancelled), disable changing plan until expiry.
  const planChangeLocked = hasActiveProAccess;

  const visiblePlans = useMemo(() => plans.filter((p) => p.key !== ('free' as any) && String(p.key) !== 'free'), [plans]);

  // Single source of truth for selection to avoid effect "ping-pong" loops.
  // Sync UI selection with backend planType (= currentPlanKey / activePlanKey).
  const desiredSelectedPlan = useMemo<PlanRow['key'] | null>(() => {
    if (!visiblePlans.length) return null;
    if (activePlanKey) {
      const row = visiblePlans.find((p) => p.key === activePlanKey);
      if (row) return row.key;
    }
    if (selectedPlan && visiblePlans.some((p) => p.key === selectedPlan)) return selectedPlan;
    return visiblePlans[0].key;
  }, [activePlanKey, visiblePlans, selectedPlan]);

  useEffect(() => {
    if (!desiredSelectedPlan) return;
    if (desiredSelectedPlan !== selectedPlan) setSelectedPlan(desiredSelectedPlan);
  }, [desiredSelectedPlan, selectedPlan]);

  const picked = plans.find((p) => p.key === selectedPlan) || null;
  const monthly = plans.find((p) => p.key === 'monthly') || null;
  const yearly = plans.find((p) => p.key === 'yearly') || null;
  const saveVsMonthly =
    monthly && yearly ? Math.max(0, Number(monthly.finalPrice || 0) * 12 - Number(yearly.finalPrice || 0)) : 0;

  const planLabel = useCallback((k: PlanRow['key'] | null | undefined) => {
    if (k === 'trial') return 'Trial';
    if (k === 'monthly') return 'Monthly';
    if (k === '6month') return '6 Month';
    if (k === 'yearly') return 'Yearly';
    return '—';
  }, []);

  const statusLabel = useMemo(() => {
    if (isExpired) return 'Expired';
    return 'Active';
  }, [isExpired]);

  const startPayment = useCallback(
    async (planRow: PlanRow) => {
      if (payBusy) return;
      if (Platform.OS === 'web') {
        Alert.alert('Not supported', 'Payment is not supported on web.');
        return;
      }

      // No plan activates without payment (trial is also paid).

      if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
        Alert.alert(
          'Razorpay not available',
          'Razorpay module is not linked. Run the app with a Dev Client (expo run:android/ios) after installing react-native-razorpay.'
        );
        return;
      }

      setPayBusy(true);
      try {
        const order = await apiPost<{
          ok: boolean;
          orderId: string;
          keyId: string;
          amount: number; // paise
          currency: 'INR';
          planId: string;
          planKey: string;
        }>(`/api/payment/create-order`, { planId: planRow.id });

        const options = {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: currentUser?.name || 'Library',
          description: `${planRow.name}`,
          prefill: {
            name: currentUser?.ownerName || currentUser?.name || '',
            email: currentUser?.email || '',
            contact: currentUser?.phone || '',
          },
          theme: { color: subColors.accent },
        };

        const data = await RazorpayCheckout.open(options);
        // Only after verify success we show success UI.
        const verify = await apiPost<{ ok: boolean; user?: any; message?: string }>(`/api/payment/verify`, {
          planId: planRow.id,
          orderId: data.razorpay_order_id,
          paymentId: data.razorpay_payment_id,
          signature: data.razorpay_signature,
        });

        if (verify?.user) {
          useAppStore.setState({ currentUser: verify.user });
        }
        if (verify?.ok) {
          navigation.navigate('PaymentSuccess');
        } else {
          navigation.navigate('PaymentError', { message: verify?.message || 'Payment verification failed', retryTo: 'Subscription' });
        }
      } catch (e: any) {
        // Razorpay throws on cancel/failure; verify errors are handled by API catch.
        const msg = String(e?.description || e?.message || '').toLowerCase();
        if (msg.includes('cancel') || msg.includes('canceled')) {
          // user cancelled: no error popup required
          return;
        }

        // PhonePe/UPI-intent edge case: payment may succeed but SDK/verify may throw.
        // Recover by re-checking latest subscription from backend.
        try {
          const me = await apiGet<{ ok: boolean; user?: any }>(`/api/subscription/me`);
          if (me?.user) {
            useAppStore.setState({ currentUser: me.user });
            const exp = me.user?.planExpiryDate ? new Date(me.user.planExpiryDate).getTime() : null;
            const active =
              me.user?.subscriptionStatus === 'active' &&
              exp &&
              Number.isFinite(exp) &&
              Date.now() < exp;
            if (active) {
              navigation.navigate('PaymentSuccess');
              return;
            }
          }
        } catch {
          // ignore recovery errors; show fallback error below
        }

        const err = e as ApiError;
        const m = err?.message || e?.message || 'Something went wrong. Please try again later.';
        const code = typeof (err as any)?.status === 'number' ? ` (HTTP ${(err as any).status})` : '';
        navigation.navigate('PaymentError', { message: `${m}${code}`, retryTo: 'Subscription' });
      } finally {
        setPayBusy(false);
      }
    },
    [RazorpayCheckout, currentUser, navigation, payBusy]
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.kicker}>PREMIUM ACCESS · PRO</Text>
        <Text style={styles.title}>TrackMyLibrary</Text>
      </View>

      {/* Current plan summary */}
      <View style={styles.currentCard}>
        <View style={styles.currentTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.currentKicker}>CURRENT PLAN</Text>
            <Text style={styles.currentTitle}>
              {planLabel(activePlanKey)}
            </Text>
          </View>
          <View style={[styles.statusPill, isExpired ? styles.statusPillExpired : styles.statusPillActive]}>
            <Text style={[styles.statusTxt, isExpired ? styles.statusTxtExpired : styles.statusTxtActive]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.periodBlockTitle}>SUBSCRIPTION PERIOD</Text>
        <Text style={styles.periodRangeTxt}>
          {subscriptionPeriodSummary ?? '--'}
        </Text>

        <View style={styles.currentMetaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>JOIN DATE</Text>
            <Text style={styles.metaVal}>{formatSubscriptionDateEnIn(planStartDate)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>EXPIRY DATE</Text>
            <Text style={styles.metaVal}>{formatExpiryForLibrary(expiryDate, plan)}</Text>
          </View>
        </View>
        <View style={[styles.metaItem, { marginTop: 10 }]}>
          <Text style={styles.metaLbl}>PLAN TYPE</Text>
          <Text style={styles.metaVal}>
            {hasActiveProAccess ? planLabel(activePlanKey) : plan === 'none' ? 'No plan yet' : planLabel(activePlanKey)}
          </Text>
        </View>
      </View>

      {/* Trial countdown banner */}
      {hasValidExpiry ? (
        <View style={styles.trialCard}>
          <Text style={styles.trialTxt}>
            {hasActiveProAccess ? 'PLAN' : 'TRIAL'} EXPIRES IN: {remaining.h}H {String(remaining.m).padStart(2, '0')}M {String(remaining.s).padStart(2, '0')}S
          </Text>
        </View>
      ) : plan === 'none' ? (
        <View
          style={[
            styles.trialCard,
            { backgroundColor: 'rgba(148,163,184,0.14)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.22)' },
          ]}
        >
          <Text style={[styles.trialTxt, { color: subColors.text }]}>CHOOSE A PLAN · PAYMENT REQUIRED FOR ACCESS</Text>
        </View>
      ) : (
        <View style={[styles.trialCard, { backgroundColor: 'rgba(239,68,68,0.16)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }]}>
          <Text style={styles.trialTxt}>NO ACTIVE PLAN</Text>
        </View>
      )}

      {/* Trust badge */}
      <View style={styles.trustRow}>
        <View style={styles.trustPill}>
          <Ionicons name="shield-checkmark-outline" size={16} color={subColors.accent} />
          <Text style={styles.trustTxt}>Trusted by libraries • Secure payments</Text>
        </View>
      </View>

      {/* Features */}
      <Text style={styles.sectionTitle}>WHAT YOU GET</Text>
      <View style={{ gap: subSpacing.gap }}>
        <FeatureItem
          icon="people-outline"
          title="Add Unlimited Students"
          subtitle="No limits on student records"
        />
        <FeatureItem
          icon="chatbubble-ellipses-outline"
          title="Auto WhatsApp Reminders"
          subtitle="Automated fee & expiry reminders"
        />
        <FeatureItem
          icon="receipt-outline"
          title="Send Fee Receipt on WhatsApp"
          subtitle="One-tap receipts for members"
        />
        <FeatureItem
          icon="lock-closed-outline"
          title="100% Secure Data"
          subtitle="Your data stays protected"
        />
      </View>

      {/* Plan selection */}
      <Text style={styles.sectionTitle}>CHOOSE YOUR PLAN</Text>
      {planChangeLocked ? (
        <View style={styles.lockInfo}>
          <Ionicons name="lock-closed-outline" size={16} color={subColors.subText} />
          <Text style={styles.lockInfoTxt}>
            Your plan is active till{' '}
            {hasValidExpiry ? formatSubscriptionDateEnIn(expiryDate) : 'expiry'}
            . You can change plan after it ends.
          </Text>
        </View>
      ) : null}
      <View style={{ gap: subSpacing.gap }}>
        {visiblePlans.map((p) => {
          const active = selectedPlan === p.key;
          const showYearlySave = p.key === 'yearly' && saveVsMonthly > 0;
          const hasDiscount = Number(p.discount || 0) > 0 && Number(p.finalPrice) < Number(p.price);
          const isPaidTick = Boolean(hasActiveProAccess && activePlanKey && p.key === activePlanKey);
          const isTrialTick = Boolean(hasActiveProAccess && activePlanKey === 'trial' && p.key === 'trial');
          const isCurrentPlan = Boolean(activePlanKey && p.key === activePlanKey && !isExpired);
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.9}
              onPress={() => (planChangeLocked ? null : setSelectedPlan(p.key))}
              style={[
                styles.planCard,
                active && styles.planCardSelected,
                planChangeLocked && { opacity: 0.55 },
              ]}
              disabled={payBusy || planChangeLocked}
            >
              <View style={[styles.radioOuter, active && styles.radioOuterOn]}>
                {active ? <View style={styles.radioInner} /> : null}
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={styles.planTitle}>{p.name}</Text>
                  {isCurrentPlan ? (
                    <View style={styles.currentPill}>
                      <Text style={styles.currentPillTxt}>Current Plan</Text>
                    </View>
                  ) : null}
                  {p.tag ? (
                    <View style={[styles.tagPill, p.tag === 'Popular' ? styles.tagPopular : styles.tagBest]}>
                      <Text style={[styles.tagTxt, p.tag === 'Popular' ? styles.tagTxtPopular : styles.tagTxtBest]}>{String(p.tag)}</Text>
                    </View>
                  ) : null}
                </View>

                <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                    {hasDiscount ? <Text style={styles.priceStrike}>₹{p.price}</Text> : null}
                    <Text style={styles.planPrice}>
                      ₹{hasDiscount ? p.finalPrice : p.price}
                      {p.key === 'trial'
                        ? '/trial'
                        : p.key === 'monthly'
                          ? '/month'
                          : p.key === '6month'
                            ? '/6 months'
                            : '/year'}
                    </Text>
                    {hasDiscount ? (
                      <View style={styles.offPill}>
                        <Text style={styles.offTxt}>{Math.round(Number(p.discount || 0))}% OFF</Text>
                      </View>
                    ) : null}
                  </View>
                  {showYearlySave ? <Text style={styles.saveTxt}>Save ₹{saveVsMonthly} vs monthly</Text> : null}
                  <Text style={styles.planSub} numberOfLines={1}>
                    {p.key === 'trial'
                      ? 'Trial for new libraries (one-time)'
                      : p.key === 'monthly'
                        ? 'Pay monthly · Cancel anytime'
                        : p.key === '6month'
                          ? 'Best for regular libraries'
                          : 'Save more · Pro benefits'}
                  </Text>
                </>
              </View>

              <View style={{ alignItems: 'flex-end', paddingLeft: 10 }}>
                {isPaidTick ? (
                  <View style={styles.paidTick}>
                    <Ionicons name="checkmark-circle" size={18} color={subColors.accent} />
                    <Text style={styles.paidTickTxt}>ACTIVE</Text>
                  </View>
                ) : null}
                {isTrialTick ? (
                  <View style={styles.paidTick}>
                    <Ionicons name="checkmark-circle" size={18} color={subColors.accent} />
                    <Text style={styles.paidTickTxt}>TRIAL</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => (picked ? startPayment(picked) : null)}
        disabled={payBusy || !picked || planChangeLocked}
        style={[styles.unlockBtn, (payBusy || planChangeLocked) && { opacity: 0.75 }]}
      >
        <Text style={styles.unlockBtnTxt}>
          {payBusy
            ? 'PLEASE WAIT…'
            : planChangeLocked
              ? 'PLAN ACTIVE'
              : isExpired
                ? 'UPGRADE NOW'
                : 'UNLOCK PRO ACCESS'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.footer}>Risk-free. Cancel anytime</Text>

      {canCancel ? (
        <View style={{ marginTop: 14 }}>
          {subStatus === 'cancelled' ? (
            <View style={styles.cancelInfo}>
              <Text style={styles.cancelInfoTxt}>Your plan will remain active till expiry.</Text>
            </View>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              // reset modal state each time to avoid stale reason/note
              setCancelReason(null);
              setCancelNote('');
              setOfferOpen(false);
              setCancelOpen(true);
            }}
            style={[styles.cancelBtn, subStatus === 'cancelled' && { opacity: 0.65 }]}
            disabled={subStatus === 'cancelled'}
          >
            <Text style={styles.cancelBtnTxt}>Cancel Membership</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={() => setCancelOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Subscription?</Text>
            <Text style={styles.modalMsg}>Help us improve by sharing your reason (optional).</Text>

            <View style={styles.reasonList}>
              {[
                'Too expensive',
                'Not using enough',
                'Missing features',
                'Switching to another app',
                'Technical issues',
                'Other',
              ].map((r) => {
                const active = cancelReason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    activeOpacity={0.9}
                    onPress={() => setCancelReason(r)}
                    style={styles.reasonRow}
                  >
                    <View style={[styles.reasonRadioOuter, active && styles.reasonRadioOuterOn]}>
                      {active ? <View style={styles.reasonRadioInnerOn} /> : null}
                    </View>
                    <Text style={styles.reasonTxt}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {cancelReason === 'Other' ? (
              <View style={{ marginTop: 10 }}>
                <TextInput
                  value={cancelNote}
                  onChangeText={setCancelNote}
                  placeholder="Tell us more..."
                  placeholderTextColor={subColors.subText}
                  style={styles.noteInput}
                  multiline
                />
              </View>
            ) : null}

            <View style={styles.warnBox}>
              <Text style={styles.warnTxt}>Your plan will remain active till expiry. This will stop future billing.</Text>
            </View>

            <View style={styles.modalRow}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setCancelOpen(false)} style={styles.keepBtn}>
                <Text style={styles.keepBtnTxt}>Keep Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={async () => {
                  // Retention offer: only for "Too expensive"
                  if (cancelReason === 'Too expensive') {
                    setOfferOpen(true);
                    return;
                  }
                  setCancelling(true);
                  const res = await cancelSubscription({
                    reason: cancelReason,
                    note: cancelReason === 'Other' ? cancelNote : null,
                  });
                  setCancelling(false);
                  if (!res.ok) return Alert.alert('Error', res.message || 'Failed to cancel');
                  setCancelOpen(false);
                  Alert.alert('Subscription cancelled', 'Your plan will remain active till expiry.');
                }}
                style={[styles.confirmCancelBtn, cancelling && { opacity: 0.75 }]}
                disabled={cancelling}
              >
                <Text style={styles.confirmCancelTxt}>{cancelling ? 'CANCELLING…' : 'Confirm Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Retention offer */}
      <Modal visible={offerOpen} transparent animationType="fade" onRequestClose={() => setOfferOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Wait! Get 20% off</Text>
            <Text style={styles.modalMsg}>Stay with PRO at a discounted price.</Text>

            <View style={styles.modalRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={async () => {
                  await saveRetentionChoice('accept_discount');
                  setOfferOpen(false);
                  setCancelOpen(false);
                  Alert.alert('Offer noted', 'We will show the discounted option soon.');
                }}
                style={styles.keepBtn}
              >
                <Text style={styles.keepBtnTxt}>Accept discount</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={async () => {
                  await saveRetentionChoice('continue_cancel');
                  setCancelling(true);
                  const res = await cancelSubscription({
                    reason: cancelReason,
                    note: cancelReason === 'Other' ? cancelNote : null,
                  });
                  setCancelling(false);
                  if (!res.ok) return Alert.alert('Error', res.message || 'Failed to cancel');
                  setOfferOpen(false);
                  setCancelOpen(false);
                  Alert.alert('Subscription cancelled', 'Your plan will remain active till expiry.');
                }}
                style={[styles.confirmCancelBtn, cancelling && { opacity: 0.75 }]}
                disabled={cancelling}
              >
                <Text style={styles.confirmCancelTxt}>{cancelling ? 'CANCELLING…' : 'Continue cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function FeatureItem(props: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  const { icon, title, subtitle } = props;
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={18} color={subColors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: subColors.background },
  content: { padding: subSpacing.screen, paddingBottom: 120 },

  header: { marginBottom: 12 },
  kicker: { color: subColors.subText, fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },
  title: { color: subColors.text, fontWeight: '900', fontSize: 28, letterSpacing: -0.6, marginTop: 6 },

  currentCard: {
    marginTop: 10,
    backgroundColor: subColors.card,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    borderWidth: 1,
    borderColor: subColors.border,
    ...subShadow.card,
  },
  currentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  currentKicker: { color: subColors.subText, fontWeight: '900', letterSpacing: 1.1, fontSize: 11 },
  currentTitle: { marginTop: 6, color: subColors.text, fontWeight: '900', fontSize: 18, letterSpacing: -0.2 },
  periodBlockTitle: {
    marginTop: 16,
    color: subColors.subText,
    fontWeight: '900',
    letterSpacing: 1.1,
    fontSize: 11,
  },
  periodRangeTxt: {
    marginTop: 6,
    color: subColors.text,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 20,
  },
  currentMetaRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  metaItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: subColors.border, borderRadius: 14, padding: 10 },
  metaLbl: { color: subColors.subText, fontWeight: '900', fontSize: 11, letterSpacing: 0.6 },
  metaVal: { marginTop: 4, color: subColors.text, fontWeight: '900', fontSize: 13 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  statusPillActive: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.22)' },
  statusPillExpired: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.22)' },
  statusTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
  statusTxtActive: { color: '#34D399' },
  statusTxtExpired: { color: '#F87171' },

  trialCard: {
    backgroundColor: subColors.danger,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    ...subShadow.card,
  },
  trialTxt: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.7, textAlign: 'center' },

  trustRow: { marginTop: 12, marginBottom: 2, alignItems: 'flex-start' },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: subRadius.pill,
    backgroundColor: 'rgba(250,204,21,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.18)',
  },
  trustTxt: { color: subColors.subText, fontWeight: '800', fontSize: 12 },

  sectionTitle: { marginTop: 18, marginBottom: 10, color: subColors.subText, fontWeight: '900', letterSpacing: 1.1, fontSize: 12 },

  featureCard: {
    backgroundColor: subColors.card,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    borderWidth: 1,
    borderColor: subColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...subShadow.card,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(250,204,21,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { color: subColors.text, fontWeight: '900', fontSize: 13 },
  featureSub: { marginTop: 3, color: subColors.subText, fontWeight: '700', fontSize: 12 },

  planCard: {
    backgroundColor: subColors.card,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    borderWidth: 1,
    borderColor: subColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...subShadow.card,
  },
  planCardSelected: {
    borderColor: 'rgba(250,204,21,0.75)',
    backgroundColor: 'rgba(30,41,59,0.92)',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(250,204,21,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: { borderColor: 'rgba(250,204,21,0.85)' },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: subColors.accent,
  },
  planTitle: { color: subColors.text, fontWeight: '900', fontSize: 13 },
  planPrice: { marginTop: 6, color: subColors.text, fontWeight: '900', fontSize: 20, letterSpacing: -0.3 },
  planSub: { marginTop: 4, color: subColors.subText, fontWeight: '700', fontSize: 12 },
  paidTick: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  paidTickTxt: { color: subColors.accent, fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  currentPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.25)',
  },
  currentPillTxt: { color: subColors.accent, fontWeight: '900', fontSize: 11 },
  freeTxt: { color: subColors.text, fontWeight: '900', fontSize: 14 },
  saveTxt: { marginTop: 6, color: '#34D399', fontWeight: '800', fontSize: 12 },
  priceStrike: { marginTop: 6, color: subColors.subText, fontWeight: '800', fontSize: 14, textDecorationLine: 'line-through' },
  offPill: {
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.28)',
    borderRadius: subRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  offTxt: { color: subColors.accent, fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: subRadius.pill, borderWidth: 1 },
  tagTxt: { fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },
  tagPopular: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: 'rgba(16,185,129,0.28)' },
  tagTxtPopular: { color: '#34D399' },
  tagBest: { backgroundColor: 'rgba(250,204,21,0.15)', borderColor: 'rgba(250,204,21,0.28)' },
  tagTxtBest: { color: subColors.accent },

  unlockBtn: {
    marginTop: 14,
    backgroundColor: subColors.accent,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...subShadow.card,
  },
  unlockBtnTxt: { color: '#0B1B2B', fontWeight: '900', fontSize: 13, letterSpacing: 0.9 },

  footer: { marginTop: 10, textAlign: 'center', color: subColors.subText, fontWeight: '700', fontSize: 12 },

  cancelInfo: {
    backgroundColor: 'rgba(22,163,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.22)',
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    marginBottom: 10,
  },
  cancelInfoTxt: { color: subColors.text, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  lockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  lockInfoTxt: { flex: 1, color: subColors.subText, fontWeight: '800', fontSize: 12, lineHeight: 16 },
  cancelBtn: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    borderRadius: subRadius.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnTxt: { color: '#EF4444', fontWeight: '900' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: subColors.card, borderRadius: subRadius.card, padding: subSpacing.card, borderWidth: 1, borderColor: subColors.border },
  modalTitle: { fontSize: 18, fontWeight: '900', color: subColors.text },
  modalMsg: { marginTop: 8, fontSize: 13, fontWeight: '700', color: subColors.subText, lineHeight: 18 },
  reasonList: { marginTop: 12, gap: 8 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  reasonTxt: { color: subColors.text, fontWeight: '800', fontSize: 13 },
  reasonRadioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRadioOuterOn: { borderColor: 'rgba(250,204,21,0.75)' },
  reasonRadioInnerOn: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: subColors.accent,
  },
  noteInput: {
    minHeight: 90,
    borderRadius: subRadius.card,
    borderWidth: 1,
    borderColor: subColors.border,
    backgroundColor: 'rgba(148,163,184,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: subColors.text,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  warnBox: {
    marginTop: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: subRadius.card,
    padding: 12,
  },
  warnTxt: { color: subColors.text, fontWeight: '800', fontSize: 12, lineHeight: 16 },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  keepBtn: { flex: 1, borderRadius: subRadius.card, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(148,163,184,0.10)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.18)' },
  keepBtnTxt: { color: subColors.text, fontWeight: '900' },
  confirmCancelBtn: { flex: 1, borderRadius: subRadius.card, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.16)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)' },
  confirmCancelTxt: { color: '#EF4444', fontWeight: '900' },
});

