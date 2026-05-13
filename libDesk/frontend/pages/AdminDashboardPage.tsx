import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiDelete, apiGet, apiPatch, apiPost, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';
import { BarChart, DonutChart, LineChart } from '../components/ui/SimpleCharts';
import { Dimensions } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type AdminStats = {
  totalLibraries: number;
  activeLibraries: number;
  totalStudents: number;
  revenue: number;
};

type LibraryRow = {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  plan: 'none' | 'pro';
  status: 'active' | 'blocked';
  isActive: boolean;
  createdAt?: string | null;
  studentCount?: number;
};

type RevenuePoint = { month: string; revenue: number };
type RevenueAnalytics = {
  ok: boolean;
  months: number;
  revenue: RevenuePoint[];
  subscriptions: { active: number; expired: number };
};

type SubscriptionRow = {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  plan: 'none' | 'pro';
  expiryDate: string | null;
  status: 'active' | 'expired';
  isActive: boolean;
};

type LogRow = {
  id: string;
  action: string;
  userId: string | null;
  role: string | null;
  libraryId: string | null;
  timestamp: string | null;
};

/**
 * AdminDashboardPage
 *
 * Requirements implemented:
 * - Restrict: only admin role
 * - Fetch stats: GET /api/admin/dashboard
 * - Fetch libraries: GET /api/admin/libraries
 * - Actions:
 *   - Block/Unblock: PATCH /api/admin/libraries/:id/block
 *   - Delete: DELETE /api/admin/libraries/:id
 *
 * Notes:
 * - Uses central Axios service; auth token is attached automatically.
 * - UI is simple, rounded, clean (matches existing card style).
 */
export default function AdminDashboardPage() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [libraries, setLibraries] = useState<LibraryRow[]>([]); // for pickers (notify/logs)
  const [recentLibraries, setRecentLibraries] = useState<LibraryRow[]>([]);
  const [analyticsMonths, setAnalyticsMonths] = useState<6 | 12>(6);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<RevenueAnalytics | null>(null);
  const [subOverviewLoading, setSubOverviewLoading] = useState(false);
  const [subOverviewError, setSubOverviewError] = useState<string | null>(null);
  const [subOverview, setSubOverview] = useState<{ active: number; expiringSoon: number; expired: number }>({
    active: 0,
    expiringSoon: 0,
    expired: 0,
  });

  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyTarget, setNotifyTarget] = useState<'all' | string>('all');
  const [notifySending, setNotifySending] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);

  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLibraryId, setLogsLibraryId] = useState<'all' | string>('all');
  const [logsFrom, setLogsFrom] = useState('');
  const [logsTo, setLogsTo] = useState('');
  const [logsPickerOpen, setLogsPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend calls (admin-only):
      // - GET /api/admin/dashboard
      // - GET /api/admin/libraries (for pickers)
      // - GET /api/admin/libraries?includeCounts=1&limit=5 (recent preview)
      const [dash, libs, recent] = await Promise.all([
        apiGet<{ ok: boolean; stats: AdminStats }>(`/api/admin/dashboard`),
        apiGet<{ ok: boolean; libraries: LibraryRow[] }>(`/api/admin/libraries`, { page: 1, limit: 50 }),
        apiGet<{ ok: boolean; libraries: LibraryRow[] }>(`/api/admin/libraries`, { page: 1, limit: 5, includeCounts: 1 }),
      ]);
      setStats(dash.stats);
      setLibraries(libs.libraries || []);
      setRecentLibraries(recent.libraries || []);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(
    async (months: 6 | 12) => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        /**
         * Revenue analytics connection:
         * GET /api/admin/analytics/revenue?months=6|12
         */
        const res = await apiGet<RevenueAnalytics>(`/api/admin/analytics/revenue`, { months });
        setAnalytics(res);
      } catch (e: any) {
        const err = e as ApiError;
        setAnalyticsError(err?.message || 'Failed to load analytics');
      } finally {
        setAnalyticsLoading(false);
      }
    },
    []
  );

  const loadSubscriptionOverview = useCallback(async () => {
    setSubOverviewLoading(true);
    setSubOverviewError(null);
    try {
      /**
       * Subscription overview for donut:
       * GET /api/admin/subscriptions?status=all
       */
      const res = await apiGet<{ ok: boolean; rows: SubscriptionRow[] }>(`/api/admin/subscriptions`, { status: 'all' });
      const rows = res.rows || [];
      const now = Date.now();
      const soonMs = 7 * 24 * 60 * 60 * 1000;
      let active = 0;
      let expiringSoon = 0;
      let expired = 0;
      for (const r of rows) {
        if (r.status === 'expired') {
          expired += 1;
          continue;
        }
        active += 1;
        if (r.expiryDate) {
          const t = new Date(r.expiryDate).getTime();
          if (Number.isFinite(t) && t - now <= soonMs) expiringSoon += 1;
        }
      }
      setSubOverview({ active, expiringSoon, expired });
    } catch (e: any) {
      const err = e as ApiError;
      setSubOverviewError(err?.message || 'Failed to load subscription overview');
    } finally {
      setSubOverviewLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      /**
       * System logs connection:
       * GET /api/admin/logs?libraryId=&from=&to=
       */
      const params: any = {};
      if (logsLibraryId !== 'all') params.libraryId = logsLibraryId;
      if (logsFrom.trim()) params.from = logsFrom.trim();
      if (logsTo.trim()) params.to = logsTo.trim();
      const res = await apiGet<{ ok: boolean; logs: LogRow[] }>(`/api/admin/logs`, params);
      setLogs(res.logs || []);
    } catch (e: any) {
      const err = e as ApiError;
      setLogsError(err?.message || 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }, [logsLibraryId, logsFrom, logsTo]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    load();
  }, [isAuthenticated, role, load]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    loadAnalytics(analyticsMonths);
  }, [isAuthenticated, role, analyticsMonths, loadAnalytics]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    loadSubscriptionOverview();
  }, [isAuthenticated, role, loadSubscriptionOverview]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    loadLogs();
  }, [isAuthenticated, role, loadLogs]);

  const recentActivities = useMemo(() => {
    const items = (logs || []).slice(0, 6).map((l) => {
      const when = l.timestamp ? new Date(l.timestamp).toLocaleString() : '—';
      const who = l.role ? l.role.toUpperCase() : 'SYSTEM';
      const action = String(l.action || 'activity')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
      return { id: l.id, title: action, meta: `${who} • ${when}` };
    });
    return items;
  }, [logs]);

  const onSendNotify = async () => {
    const title = notifyTitle.trim();
    const message = notifyMessage.trim();
    if (!title || !message) {
      Alert.alert('Required', 'Please enter title and message.');
      return;
    }
    setNotifySending(true);
    try {
      /**
       * Admin → library notification connection:
       * POST /api/admin/notify
       * Body: { title, message, target: "all" | libraryId }
       */
      await apiPost(`/api/admin/notify`, { title, message, target: notifyTarget });
      Alert.alert('Sent', 'Notification sent to libraries.');
      setNotifyTitle('');
      setNotifyMessage('');
      setNotifyTarget('all');
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to send notification');
    } finally {
      setNotifySending(false);
    }
  };

  const cards = useMemo(() => {
    const s = stats || { totalLibraries: 0, activeLibraries: 0, totalStudents: 0, revenue: 0 };
    return [
      { label: 'Total Libraries', value: s.totalLibraries, icon: 'business-outline' as const, color: '#4F46E5', bg: '#EEF2FF' },
      { label: 'Active Libraries', value: s.activeLibraries, icon: 'checkmark-circle-outline' as const, color: '#059669', bg: '#ECFDF5' },
      { label: 'Total Students', value: s.totalStudents, icon: 'people-outline' as const, color: '#0EA5E9', bg: '#F0F9FF' },
      { label: 'Revenue', value: `₹${s.revenue}`, icon: 'cash-outline' as const, color: '#D97706', bg: '#FFFBEB' },
    ];
  }, [stats]);

  const chartWidth = Math.min(Dimensions.get('window').width - theme.spacing.lg * 2 - 28, 520);
  const revenueValues = (analytics?.revenue || []).map((p) => Number(p.revenue || 0));
  const barSubValues = [analytics?.subscriptions.active || 0, analytics?.subscriptions.expired || 0];
  const donutValues = [subOverview.active, subOverview.expiringSoon, subOverview.expired];

  if (!isAuthenticated()) return <LoginScreen />;
  if (role && role !== 'admin') return <ForbiddenScreen message="This page is only for admin accounts." />;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background, padding: 18 }]}>
        <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.85}>
          <Text style={styles.retryTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <TouchableOpacity onPress={load} style={styles.iconBtn} activeOpacity={0.85} accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Stats cards */}
      <View style={styles.grid}>
        {cards.map((c) => (
          <View key={c.label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: c.bg }]}>
              <Ionicons name={c.icon} size={18} color={c.color} />
            </View>
            <Text style={styles.statVal}>{c.value}</Text>
            <Text style={styles.statLbl}>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* Main layout row (screenshot-style) */}
      <View style={styles.mainRow}>
        {/* Revenue overview */}
        <View style={[styles.tableCard, { flex: 1, minWidth: 320 }]}>
          <View style={styles.tableHead}>
            <Text style={styles.tableTitle}>Revenue Overview</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setAnalyticsMonths(6)}
                activeOpacity={0.85}
                style={[styles.filterBtn, analyticsMonths === 6 && styles.filterBtnActive]}
              >
                <Text style={[styles.filterTxt, analyticsMonths === 6 && styles.filterTxtActive]}>Last 6 months</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAnalyticsMonths(12)}
                activeOpacity={0.85}
                style={[styles.filterBtn, analyticsMonths === 12 && styles.filterBtnActive]}
              >
                <Text style={[styles.filterTxt, analyticsMonths === 12 && styles.filterTxtActive]}>Last 12 months</Text>
              </TouchableOpacity>
            </View>
          </View>

          {analyticsLoading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
            </View>
          ) : analyticsError ? (
            <View style={{ paddingVertical: 16 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>{analyticsError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => loadAnalytics(analyticsMonths)} activeOpacity={0.85}>
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.chartLabel}>Monthly revenue</Text>
              <LineChart width={chartWidth} height={150} values={revenueValues.length ? revenueValues : [0]} stroke="#4F46E5" />

              <View style={{ marginTop: 16 }}>
                <Text style={styles.chartLabel}>Subscriptions (active vs expired)</Text>
                <BarChart width={chartWidth} height={110} values={barSubValues} colors={['#059669', '#DC2626']} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <Text style={styles.chartLegend}>Active: {barSubValues[0]}</Text>
                  <Text style={styles.chartLegend}>Expired: {barSubValues[1]}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Subscription status */}
        <View style={[styles.tableCard, { width: 320, minWidth: 280 }]}>
          <View style={styles.tableHead}>
            <Text style={styles.tableTitle}>Subscription Status</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.linkBtn}
              onPress={() => navigation.navigate('AdminRoot', { screen: 'Subscriptions' })}
            >
              <Text style={styles.linkTxt}>View all</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedText} />
            </TouchableOpacity>
          </View>

          {subOverviewLoading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
            </View>
          ) : subOverviewError ? (
            <View style={{ paddingVertical: 16 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>{subOverviewError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSubscriptionOverview} activeOpacity={0.85}>
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <DonutChart size={160} thickness={16} values={donutValues} colors={['#16A34A', '#F59E0B', '#DC2626']} />
              <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
                <View style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: '#16A34A' }]} />
                  <Text style={styles.legendTxt}>Active</Text>
                  <Text style={styles.legendVal}>{subOverview.active}</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.legendTxt}>Expiring soon</Text>
                  <Text style={styles.legendVal}>{subOverview.expiringSoon}</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: '#DC2626' }]} />
                  <Text style={styles.legendTxt}>Expired</Text>
                  <Text style={styles.legendVal}>{subOverview.expired}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Secondary row */}
      <View style={styles.mainRow}>
        {/* Recent activities */}
        <View style={[styles.tableCard, { flex: 1, minWidth: 320 }]}>
          <View style={styles.tableHead}>
            <Text style={styles.tableTitle}>Recent Activities</Text>
            <TouchableOpacity onPress={loadLogs} activeOpacity={0.85} style={styles.iconBtn} accessibilityLabel="Refresh activities">
              <Ionicons name="refresh" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {logsLoading ? (
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
            </View>
          ) : logsError ? (
            <View style={{ paddingVertical: 14 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>{logsError}</Text>
            </View>
          ) : recentActivities.length ? (
            <View style={{ gap: 10 }}>
              {recentActivities.map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <View style={styles.activityDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Text style={styles.activityMeta} numberOfLines={1}>
                      {a.meta}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>No activity yet.</Text>
          )}
        </View>

        {/* Recently registered libraries */}
        <View style={[styles.tableCard, { width: 420, minWidth: 320 }]}>
          <View style={styles.tableHead}>
            <Text style={styles.tableTitle}>Recently Registered Libraries</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.linkBtn}
              onPress={() => navigation.navigate('Libraries')}
            >
              <Text style={styles.linkTxt}>View all</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedText} />
            </TouchableOpacity>
          </View>

          {recentLibraries.length ? (
            <View>
              <View style={[styles.row, styles.rowHead]}>
                <Text style={[styles.cell, styles.hCell, { width: 170 }]}>Library</Text>
                <Text style={[styles.cell, styles.hCell, { width: 90 }]}>Plan</Text>
                <Text style={[styles.cell, styles.hCell, { width: 90 }]}>Students</Text>
              </View>
              {recentLibraries.map((lib) => (
                <View key={lib.id} style={styles.row}>
                  <Text style={[styles.cell, { width: 170 }]} numberOfLines={1}>
                    {lib.name}
                  </Text>
                  <Text style={[styles.cell, { width: 90, textTransform: 'uppercase' }]} numberOfLines={1}>
                    {lib.plan}
                  </Text>
                  <Text style={[styles.cell, { width: 90 }]}>{Number(lib.studentCount || 0)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>No libraries yet.</Text>
          )}
        </View>
      </View>

      {/* Target picker */}
      <Modal visible={targetPickerOpen} transparent animationType="fade" onRequestClose={() => setTargetPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Choose target</Text>
              <TouchableOpacity onPress={() => setTargetPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.targetRow}
              activeOpacity={0.85}
              onPress={() => {
                setNotifyTarget('all');
                setTargetPickerOpen(false);
              }}
            >
              <Text style={styles.targetTxt}>All libraries</Text>
            </TouchableOpacity>

            {libraries.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={styles.targetRow}
                activeOpacity={0.85}
                onPress={() => {
                  setNotifyTarget(l.id);
                  setTargetPickerOpen(false);
                }}
              >
                <Text style={styles.targetTxt} numberOfLines={1}>{l.name}</Text>
                <Text style={styles.targetSub} numberOfLines={1}>{l.email}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Logs library filter picker */}
      <Modal visible={logsPickerOpen} transparent animationType="fade" onRequestClose={() => setLogsPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filter logs by library</Text>
              <TouchableOpacity onPress={() => setLogsPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.targetRow}
              activeOpacity={0.85}
              onPress={() => {
                setLogsLibraryId('all');
                setLogsPickerOpen(false);
              }}
            >
              <Text style={styles.targetTxt}>All libraries</Text>
            </TouchableOpacity>

            {libraries.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={styles.targetRow}
                activeOpacity={0.85}
                onPress={() => {
                  setLogsLibraryId(l.id);
                  setLogsPickerOpen(false);
                }}
              >
                <Text style={styles.targetTxt} numberOfLines={1}>{l.name}</Text>
                <Text style={styles.targetSub} numberOfLines={1}>{l.email}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function withAlpha(hex: string, alpha: number) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

function makeStyles(_mode: 'light' | 'dark') {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3, marginTop: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: {
    flexGrow: 1,
    minWidth: 160,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    ...theme.shadow.card,
  },
  statIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statVal: { marginTop: 10, fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  statLbl: { marginTop: 4, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },

  tableCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    ...theme.shadow.card,
  },
  mainRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  tableHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 },
  tableTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  tableSub: { fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  linkTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterBtnActive: { borderColor: withAlpha(theme.colors.primary, 0.35), backgroundColor: withAlpha(theme.colors.primary, 0.12) },
  filterTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText },
  filterTxtActive: { color: theme.colors.primary },
  chartLabel: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8 },
  chartLegend: { fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
  formField: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(theme.colors.dark, 0.62),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    ...theme.shadow.card,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  targetRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  targetTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  targetSub: { marginTop: 2, fontSize: 11, fontWeight: '700', color: theme.colors.mutedText },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowHead: { paddingTop: 0 },
  cell: { fontSize: 12, fontWeight: '700', color: theme.colors.text, paddingRight: 10 },
  hCell: { fontWeight: '900', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.9 },

  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 999, marginRight: 8 },
  legendTxt: { flex: 1, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
  legendVal: { fontSize: 12, fontWeight: '900', color: theme.colors.text },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: theme.colors.primary },
  activityTitle: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  activityMeta: { marginTop: 2, fontSize: 11, fontWeight: '700', color: theme.colors.mutedText },

  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 11, fontWeight: '900' },

  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionTxt: { fontSize: 11, fontWeight: '900' },

  retryBtn: { marginTop: 14, backgroundColor: theme.colors.dark, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  retryTxt: { color: theme.colors.surface, fontWeight: '900' },
  });
}

