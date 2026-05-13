import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiGet, apiPost, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';
import { useTheme } from '../theme/ThemeProvider';

/**
 * SubscriptionDetailScreen (Admin)
 *
 * Structure (SaaS-style):
 * 1) Header
 * 2) Library card
 * 3) Owner info
 * 4) Plan info
 * 5) Subscription period + progress
 * 6) Stats grid
 * 7) Actions
 * 8) Recent payments
 */

type Detail = {
  ok: boolean;
  libraryName: string;
  libraryCode: string;
  isActive: boolean;
  libraryPlan: 'none' | 'pro';
  owner: { name: string; phone: string | null; email: string };
  subscription: {
    plan: 'none' | 'trial' | 'monthly' | '6month' | 'yearly';
    price: number;
    startDate: string | null;
    expiryDate: string | null;
    status: 'active' | 'expired' | 'cancelled';
    paymentStatus: 'paid' | 'pending';
    paymentMethod?: string | null;
  };
  stats: {
    totalSeats: number;
    totalStudents: number;
    activeStudents: number;
    revenue: number;
  };
  payments?: Array<{
    id: string;
    plan: 'monthly' | '6month' | 'yearly';
    amount: number;
    currency: string;
    status: 'paid' | 'failed';
    orderId: string;
    paymentId: string;
    date: string | null;
  }>;
};

type PaymentRow = {
  id: string;
  status: 'paid' | 'failed';
  orderId: string;
  paymentId: string;
  plan: 'monthly' | '6month' | 'yearly';
  currency: string;
  date: string;
  amount: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every((x) => Number.isFinite(x))) return null;
  return { r, g, b };
}

function withAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(alpha, 0, 1)})`;
}

function useStyles() {
  const { mode } = useTheme();
  return useMemo(() => makeStyles(mode), [mode]);
}

/** en-IN calendar display: DD MMM YYYY (null-safe). */
function formatDisplayDate(iso: string | null | undefined) {
  const raw = iso == null ? '' : String(iso).trim();
  if (!raw) return '--';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Legacy name — avoids ReferenceError if any path still calls `formatDate`. */
const formatDate = formatDisplayDate;

function hasValidIsoDate(iso: string | null | undefined) {
  const raw = iso == null ? '' : String(iso).trim();
  if (!raw) return false;
  return Number.isFinite(new Date(raw).getTime());
}

function formatSubscriptionPeriodLabel(
  iso: string | null | undefined,
  field: 'start' | 'expiry',
  libraryPlan: Detail['libraryPlan'],
  subPlan: Detail['subscription']['plan']
) {
  const raw = iso == null ? '' : String(iso).trim();
  if (!raw) {
    if (field === 'expiry' && libraryPlan === 'none' && subPlan === 'none') return 'No expiry';
    return '--';
  }
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function planName(p: Detail['subscription']['plan']) {
  if (p === 'monthly') return 'Monthly Plan';
  if (p === '6month') return '6 Month Plan';
  if (p === 'yearly') return 'Yearly Plan';
  if (p === 'trial') return 'Trial Plan';
  return 'No plan';
}

function money(n: number) {
  return `₹${Number(n || 0)}`;
}

function Badge({ label, tone }: { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  const styles = useStyles();
  const bg =
    tone === 'success'
      ? withAlpha(theme.colors.success, 0.12)
      : tone === 'danger'
        ? withAlpha(theme.colors.danger, 0.12)
        : tone === 'warning'
          ? withAlpha(theme.colors.warning, 0.14)
          : withAlpha(theme.colors.mutedText, 0.12);
  const border =
    tone === 'success'
      ? withAlpha(theme.colors.success, 0.35)
      : tone === 'danger'
        ? withAlpha(theme.colors.danger, 0.35)
        : tone === 'warning'
          ? withAlpha(theme.colors.warning, 0.35)
          : withAlpha(theme.colors.mutedText, 0.25);
  const fg =
    tone === 'success'
      ? theme.colors.success
      : tone === 'danger'
        ? theme.colors.danger
        : tone === 'warning'
          ? theme.colors.warning
          : theme.colors.text;

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.badgeTxt, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Card({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{title}</Text>
          {right ? <View>{right}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <View style={styles.infoIcon}>
          <Ionicons name={icon as any} size={16} color={theme.colors.mutedText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const styles = useStyles();
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${clamp(progress, 0, 1) * 100}%` }]} />
    </View>
  );
}

function StatsGrid({ stats }: { stats: Detail['stats'] }) {
  const styles = useStyles();
  const items = [
    { icon: 'apps-outline', label: 'Total Seats', value: String(stats.totalSeats) },
    { icon: 'people-outline', label: 'Total Students', value: String(stats.totalStudents) },
    { icon: 'checkmark-circle-outline', label: 'Active Students', value: String(stats.activeStudents) },
    { icon: 'cash-outline', label: 'Total Revenue', value: money(stats.revenue) },
  ] as const;

  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <View key={it.label} style={styles.statCard}>
          <View style={styles.statIcon}>
            <Ionicons name={it.icon as any} size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.statValue}>{it.value}</Text>
          <Text style={styles.statLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function PaymentItem({ row, onDownload }: { row: PaymentRow; onDownload: (row: PaymentRow) => void }) {
  const styles = useStyles();
  const paid = row.status === 'paid';
  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentIcon}>
        <Ionicons
          name={paid ? 'checkmark-circle' : 'close-circle'}
          size={18}
          color={paid ? theme.colors.success : theme.colors.danger}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.paymentOrder} numberOfLines={1}>
          {row.orderId}
        </Text>
        <Text style={styles.paymentMeta} numberOfLines={1}>{`Payment: ${row.paymentId}`}</Text>
        <Text style={styles.paymentMeta} numberOfLines={1}>{`Plan: ${row.plan} · ${money(row.amount)} ${row.currency}`}</Text>
        <Text style={styles.paymentMeta} numberOfLines={1}>{`Date: ${formatDisplayDate(row.date)}`}</Text>
      </View>
      <TouchableOpacity onPress={() => onDownload(row)} style={styles.paymentBtn} activeOpacity={0.85}>
        <Ionicons name="download-outline" size={18} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  );
}

export default function AdminSubscriptionDetailPage() {
  const navigation = useNavigation<any>();
  const styles = useStyles();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const route = useRoute<any>();
  const libraryId = String(route?.params?.libraryId || '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const payments: PaymentRow[] = useMemo(() => {
    const list = detail?.payments || [];
    return list.map((p) => ({
      id: p.id,
      status: p.status,
      orderId: p.orderId,
      paymentId: p.paymentId,
      plan: p.plan,
      currency: p.currency || 'INR',
      date: p.date || new Date().toISOString(),
      amount: Number(p.amount || 0),
    }));
  }, [detail?.payments]);

  const load = useCallback(async () => {
    if (!libraryId) {
      setError('Missing libraryId');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<Detail>(`/api/admin/library/${libraryId}/subscription`);
      setDetail({
        ...res,
        subscription: {
          ...res.subscription,
          paymentMethod: res.subscription.paymentMethod ?? 'Razorpay',
        },
      });
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load subscription detail');
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    load();
  }, [isAuthenticated, role, load]);

  const statusTone = useMemo(() => {
    const s = detail?.subscription.status || 'active';
    if (s === 'expired') return 'danger';
    if (s === 'cancelled') return 'warning';
    return 'success';
  }, [detail?.subscription.status]);

  const paymentTone = useMemo(() => {
    return (detail?.subscription.paymentStatus || 'paid') === 'paid' ? 'success' : 'warning';
  }, [detail?.subscription.paymentStatus]);

  const period = useMemo(() => {
    const start = detail?.subscription.startDate ? new Date(detail.subscription.startDate) : null;
    const end = detail?.subscription.expiryDate ? new Date(detail.subscription.expiryDate) : null;
    const now = new Date();
    if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return { progress: 0, daysLeft: null };
    }
    const total = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    const used = clamp(Math.ceil((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)), 0, total);
    const left = Math.max(0, total - used);
    return { progress: used / total, daysLeft: left };
  }, [detail?.subscription.startDate, detail?.subscription.expiryDate]);

  const onConfirmCancel = useCallback(async () => {
    try {
      await apiPost(`/api/admin/subscription/cancel`, { libraryId });
      setCancelOpen(false);
      await load();
    } catch (e: any) {
      const err = e as ApiError;
      setCancelOpen(false);
      setError(err?.message || 'Failed to cancel');
    }
  }, [libraryId, load]);

  const onUpgrade = useCallback(() => {
    // Navigate to the AdminRoot tab navigator → Subscriptions tab
    navigation.navigate('AdminRoot', { screen: 'Subscriptions' });
  }, [navigation]);

  const onDownloadPaymentPdf = useCallback(
    async (p: PaymentRow) => {
      if (!detail) return;
      try {
        const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #0f172a; }
      .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; }
      .h1 { font-size: 18px; font-weight: 800; margin: 0 0 6px 0; }
      .muted { color: #64748b; font-size: 12px; margin: 0 0 14px 0; }
      .row { display: flex; justify-content: space-between; gap: 12px; margin: 10px 0; }
      .k { color: #64748b; font-size: 12px; font-weight: 700; }
      .v { font-size: 13px; font-weight: 800; }
      .pill { display:inline-block; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; border: 1px solid #e2e8f0; }
      .paid { background: #ecfdf5; border-color: #a7f3d0; color: #059669; }
      .failed { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="h1">Payment Receipt</div>
      <div class="muted">Generated from Admin panel</div>

      <div class="row">
        <div>
          <div class="k">Library</div>
          <div class="v">${detail.libraryName} (${detail.libraryCode})</div>
        </div>
        <div style="text-align:right">
          <span class="pill ${p.status === 'paid' ? 'paid' : 'failed'}">${p.status.toUpperCase()}</span>
        </div>
      </div>

      <div class="row"><div><div class="k">Order ID</div><div class="v">${p.orderId}</div></div></div>
      <div class="row"><div><div class="k">Payment ID</div><div class="v">${p.paymentId}</div></div></div>
      <div class="row"><div><div class="k">Plan</div><div class="v">${p.plan}</div></div></div>
      <div class="row"><div><div class="k">Amount</div><div class="v">${money(p.amount)} ${p.currency}</div></div></div>
      <div class="row"><div><div class="k">Date</div><div class="v">${formatDisplayDate(p.date)}</div></div></div>
    </div>
  </body>
</html>`;

        const file = await Print.printToFileAsync({ html, base64: false });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri);
        } else {
          Alert.alert('Saved', `PDF saved at: ${file.uri}`);
        }
      } catch (e: any) {
        Alert.alert('Failed', e?.message || 'Could not generate PDF');
      }
    },
    [detail]
  );

  if (!isAuthenticated()) return <LoginScreen />;
  if (role && role !== 'admin') return <ForbiddenScreen message="This page is only for admin accounts." />;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
      </View>
    );
  }

  if (error || !detail?.ok) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background, padding: theme.spacing.lg }]}>
        <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{error || 'Unknown error'}</Text>
        <TouchableOpacity onPress={load} style={[styles.smallBtn, { marginTop: 14 }]} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color={theme.colors.text} />
          <Text style={styles.smallBtnTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hIconBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.hTitle} numberOfLines={1}>
            Library Subscription Details
          </Text>
        </View>
        <TouchableOpacity onPress={() => { }} style={styles.hIconBtn} activeOpacity={0.85}>
          <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.root} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        {/* Library card */}
        <LibraryCard detail={detail} statusTone={statusTone as any} />

        {/* Owner info */}
        <OwnerCard owner={detail.owner} onViewProfile={() => navigation.navigate('AdminLibraryDetail', { libraryId })} />

        {/* Plan info */}
        <PlanCard subscription={detail.subscription} paymentTone={paymentTone as any} />

        {/* Subscription period */}
        <PeriodCard
          libraryPlan={detail.libraryPlan}
          subscription={detail.subscription}
          progress={period.progress}
          daysLeft={period.daysLeft}
        />

        {/* Stats */}
        <Card title="Library Overview">
          <StatsGrid stats={detail.stats} />
        </Card>

        {/* Actions */}
        <ActionButtons onCancel={() => setCancelOpen(true)} onUpgrade={onUpgrade} />

        {/* Recent payments (mock) */}
        <Card
          title="Recent Payments"
          right={
            <TouchableOpacity onPress={() => { }} activeOpacity={0.85}>
              <Text style={styles.linkTxt}>View All</Text>
            </TouchableOpacity>
          }
        >
          <View style={{ gap: 10 }}>
            {payments.map((p) => (
              <PaymentItem key={p.id} row={p} onDownload={onDownloadPaymentPdf} />
            ))}
            {payments.length === 0 ? (
              <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>No payments yet</Text>
              </View>
            ) : null}
          </View>
        </Card>
      </ScrollView>

      {/* Cancel modal */}
      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={() => setCancelOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCancelOpen(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Cancel Subscription?</Text>
          <Text style={styles.modalSub}>
            This will stop future billing. Library will remain active until expiry date.
          </Text>
          <View style={styles.modalRow}>
            <TouchableOpacity onPress={() => setCancelOpen(false)} style={styles.modalBtn} activeOpacity={0.85}>
              <Text style={styles.modalBtnTxt}>Keep</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirmCancel} style={[styles.modalBtn, styles.modalBtnDanger]} activeOpacity={0.85}>
              <Text style={[styles.modalBtnTxt, { color: theme.colors.surface }]}>Confirm Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * LibraryCard
 * - Icon + name + code badge + location placeholder
 * - Status badge (Active/Cancelled/Expired) at right
 */
function LibraryCard({ detail, statusTone }: { detail: Detail; statusTone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const styles = useStyles();
  const statusLabel =
    detail.subscription.status === 'expired' ? 'Expired' : detail.subscription.status === 'cancelled' ? 'Cancelled' : 'Active';

  return (
    <Card>
      <View style={styles.libraryRow}>
        <View style={styles.libraryIcon}>
          <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.libraryName} numberOfLines={1}>
            {detail.libraryName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <View style={[styles.codeBadge, { backgroundColor: withAlpha(theme.colors.primary, 0.12), borderColor: withAlpha(theme.colors.primary, 0.28) }]}>
              <Text style={[styles.codeBadgeTxt, { color: theme.colors.primary }]}>{detail.libraryCode}</Text>
            </View>
            <Text style={styles.locationTxt} numberOfLines={1}>
              Location: —
            </Text>
          </View>
        </View>

        <Badge label={statusLabel} tone={statusTone} />
      </View>
    </Card>
  );
}

/**
 * OwnerCard
 * - Avatar + owner name/phone/email
 * - View profile button (right)
 */
function OwnerCard({ owner, onViewProfile }: { owner: Detail['owner']; onViewProfile: () => void }) {
  const styles = useStyles();
  return (
    <Card
      title="Owner Info"
      right={
        <TouchableOpacity onPress={onViewProfile} style={styles.smallBtn} activeOpacity={0.85}>
          <Ionicons name="person-circle-outline" size={18} color={theme.colors.text} />
          <Text style={styles.smallBtnTxt}>View Profile</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.ownerRow}>
        <View style={[styles.avatar, { backgroundColor: withAlpha(theme.colors.primary, 0.14), borderColor: withAlpha(theme.colors.primary, 0.25) }]}>
          <Ionicons name="person-outline" size={18} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.ownerName} numberOfLines={1}>
            {owner.name}
          </Text>
          <Text style={styles.ownerMeta} numberOfLines={1}>
            {owner.phone || '—'}
          </Text>
          <Text style={styles.ownerMeta} numberOfLines={1}>
            {owner.email}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/**
 * PlanCard
 * - Plan name + price
 * - Payment status badge + payment method
 */
function PlanCard({
  subscription,
  paymentTone,
}: {
  subscription: Detail['subscription'];
  paymentTone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const styles = useStyles();
  const paidLabel = subscription.paymentStatus === 'paid' ? 'Paid' : 'Pending';
  const per =
    subscription.plan === 'monthly'
      ? '/ month'
      : subscription.plan === 'none'
        ? ''
        : subscription.plan === 'trial'
          ? '/ trial'
          : '';

  return (
    <Card title="Plan Info">
      <View style={styles.planRow}>
        <View style={[styles.planIcon, { backgroundColor: withAlpha(theme.colors.primary, 0.14), borderColor: withAlpha(theme.colors.primary, 0.25) }]}>
          <Ionicons name="card-outline" size={18} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.planName}>{planName(subscription.plan)}</Text>
          <Text style={styles.planPrice}>
            {money(subscription.price)} {per}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <Badge label={paidLabel} tone={paymentTone} />
          <Text style={styles.methodTxt}>{subscription.paymentMethod || '—'}</Text>
        </View>
      </View>
    </Card>
  );
}

/**
 * PeriodCard
 * - Join/Expiry
 * - Progress bar + days left label
 */
function PeriodCard({
  libraryPlan,
  subscription,
  progress,
  daysLeft,
}: {
  libraryPlan: Detail['libraryPlan'];
  subscription: Detail['subscription'];
  progress: number;
  daysLeft: number | null;
}) {
  const styles = useStyles();
  const noExpiryNone =
    libraryPlan === 'none' && subscription.plan === 'none' && !hasValidIsoDate(subscription.expiryDate);
  const daysLeftLabel =
    daysLeft === null
      ? noExpiryNone
        ? 'No expiry'
        : '--'
      : `${daysLeft} Days Left`;

  return (
    <Card title="Subscription Period">
      <View style={styles.periodRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.k}>Join Date</Text>
          <Text style={styles.v}>
            {formatSubscriptionPeriodLabel(subscription.startDate, 'start', libraryPlan, subscription.plan)}
          </Text>
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.k}>Expiry Date</Text>
          <Text style={styles.v}>
            {formatSubscriptionPeriodLabel(subscription.expiryDate, 'expiry', libraryPlan, subscription.plan)}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <ProgressBar progress={progress} />
        <Text style={styles.daysLeftTxt}>{daysLeftLabel}</Text>
      </View>
    </Card>
  );
}

/**
 * ActionButtons
 * - Cancel (outline red)
 * - Upgrade (gradient, using theme colors)
 */
function ActionButtons({ onCancel, onUpgrade }: { onCancel: () => void; onUpgrade: () => void }) {
  const styles = useStyles();
  return (
    <Card title="Actions">
      <View style={styles.actionRow}>
        <TouchableOpacity onPress={onCancel} style={[styles.actionBtn, styles.actionBtnDanger]} activeOpacity={0.9}>
          <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
          <Text style={[styles.actionTxt, { color: theme.colors.danger }]}>Cancel Subscription</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onUpgrade} activeOpacity={0.9} style={{ flex: 1 }}>
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.dark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionBtnGradient}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color={theme.colors.surface} />
            <Text style={[styles.actionTxt, { color: theme.colors.surface }]}>Upgrade Plan</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function makeStyles(_mode: 'light' | 'dark') {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    marginTop: 30,
  },
  hIconBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hTitle: { fontSize: theme.text.lg, fontWeight: '900', color: theme.colors.text },

  // Shared card
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  cardTitle: { fontWeight: '900', color: theme.colors.text, fontSize: theme.text.md },
  linkTxt: { fontWeight: '900', color: theme.colors.primary, fontSize: theme.text.sm },

  // Badge
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill },
  badgeTxt: { fontWeight: '900', fontSize: 11 },

  // Info rows (Owner/Plan misc)
  infoRow: { paddingVertical: 6 },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoLabel: { fontWeight: '900', color: theme.colors.mutedText, fontSize: 12 },
  infoValue: { marginTop: 2, fontWeight: '900', color: theme.colors.text, fontSize: 13 },

  // Library card
  libraryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  libraryIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.colors.primary, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.primary, 0.22),
  },
  libraryName: { fontSize: theme.text.lg, fontWeight: '900', color: theme.colors.text },
  codeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1 },
  codeBadgeTxt: { fontWeight: '900', fontSize: 11, letterSpacing: 0.6 },
  locationTxt: { color: theme.colors.mutedText, fontWeight: '800', fontSize: 12 },

  // Owner
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ownerName: { fontWeight: '900', color: theme.colors.text, fontSize: theme.text.md },
  ownerMeta: { marginTop: 2, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },

  // Small button
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  smallBtnTxt: { fontWeight: '900', color: theme.colors.text, fontSize: 12 },

  // Plan
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  planName: { fontWeight: '900', color: theme.colors.text, fontSize: theme.text.md },
  planPrice: { marginTop: 2, fontWeight: '900', color: theme.colors.mutedText, fontSize: 12 },
  methodTxt: { fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },

  // Period
  periodRow: { flexDirection: 'row', alignItems: 'flex-start' },
  k: { fontWeight: '900', color: theme.colors.mutedText, fontSize: 12 },
  v: { marginTop: 4, fontWeight: '900', color: theme.colors.text, fontSize: 13 },
  progressTrack: {
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: withAlpha(theme.colors.mutedText, 0.12),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.mutedText, 0.18),
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill },
  daysLeftTxt: { marginTop: 8, fontWeight: '900', color: theme.colors.mutedText, fontSize: 12 },

  // Stats grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: withAlpha(theme.colors.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.primary, 0.2),
  },
  statValue: { marginTop: 10, fontWeight: '900', color: theme.colors.text, fontSize: theme.text.lg },
  statLabel: { marginTop: 4, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnDanger: { borderColor: withAlpha(theme.colors.danger, 0.4), backgroundColor: withAlpha(theme.colors.danger, 0.06) },
  actionBtnGradient: {
    minHeight: 46,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionTxt: { fontWeight: '900', fontSize: 12 },

  // Payments
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  paymentIcon: { width: 34, height: 34, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  paymentOrder: { fontWeight: '900', color: theme.colors.text },
  paymentMeta: { marginTop: 3, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },
  paymentBtn: { width: 36, height: 36, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },

  // Modal
  modalBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(theme.colors.dark, 0.55) },
  modalSheet: {
    marginHorizontal: theme.spacing.lg,
    marginTop: 'auto',
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  modalTitle: { fontWeight: '900', color: theme.colors.text, fontSize: theme.text.lg },
  modalSub: { marginTop: 8, fontWeight: '800', color: theme.colors.mutedText, lineHeight: 18 },
  modalRow: { flexDirection: 'row', gap: 12, marginTop: theme.spacing.lg },
  modalBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnDanger: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  modalBtnTxt: { fontWeight: '900', color: theme.colors.text },
  });
}

