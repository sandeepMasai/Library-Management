import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
  Image, Platform, StatusBar,
} from 'react-native';
import { useAppStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import { apiGet, type ApiError } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import { theme } from '../../theme';

type DashboardApiResponse = {
  ok: boolean;
  libraryId: string;
  students: { total: number; active: number; expired: number; blocked: number };
  payments: { feeDueCount: number; collectedAmount: number; dueAmount: number; totalFeeAmount: number };
  attendance: { date: string; todayCount: number; attendancePct: number };
};

type ActivityItem = {
  id: string;
  type: 'checkin' | 'joined' | 'notification' | 'expired';
  label: string;
  sub: string;
  date: string;
  photoUrl?: string | null;
  initial?: string;
  iconColor: string;
  iconBg: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type StatTone = 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber' | 'slate';
function statTone(tone: StatTone) {
  switch (tone) {
    case 'indigo':
      return { fg: '#4F46E5', bg: '#EEF2FF' };
    case 'violet':
      return { fg: '#7C3AED', bg: '#F5F3FF' };
    case 'emerald':
      return { fg: '#059669', bg: '#ECFDF5' };
    case 'rose':
      return { fg: '#E11D48', bg: '#FFF1F2' };
    case 'amber':
      return { fg: '#D97706', bg: '#FFFBEB' };
    case 'slate':
    default:
      return { fg: '#334155', bg: '#F1F5F9' };
  }
}

export default function AdminDashboard() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const insets = useSafeAreaInsets();
  const headerTopBg = '#064E3B'; // deep green for status bar contrast
  const currentUser = useAppStore((s) => s.currentUser);
  const users = useAppStore((s) => s.users);
  const notifications = useAppStore((s) => s.notifications);
  const role = useAppStore((s) => s.role);
  const fetchNotifications = useAppStore((s) => s.fetchNotifications);
  const getTodayAttendance = useAppStore((s) => s.getTodayAttendance);
  const logout = useAppStore((s) => s.logout);
  const scrollBottom = useScrollBottomForTabBar();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardApiResponse | null>(null);

  const fetchDashboard = useCallback(async () => {
    const data = await apiGet<DashboardApiResponse>(`/api/dashboard`);
    setDashboard(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await fetchDashboard();
        // Library dashboard: show announcements in activity feed
        if (role === 'library') {
          await fetchNotifications();
        }
      } catch (e: any) {
        const err = e as ApiError;
        if (!cancelled) setLoadError(err?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchDashboard, role, fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchDashboard(); }
    finally { setRefreshing(false); }
  }, [fetchDashboard]);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const todayList = getTodayAttendance();

  const total = dashboard?.students.total ?? 0;
  const todayCount = dashboard?.attendance.todayCount ?? 0;
  const activeCount = dashboard?.students.active ?? 0;
  const expiredCount = dashboard?.students.expired ?? 0;
  const blockedCount = dashboard?.students.blocked ?? 0;
  const pendingFeeCount = dashboard?.payments.feeDueCount ?? 0;
  const attendancePct = dashboard?.attendance.attendancePct ?? 0;

  const payments = useMemo(() => {
    return {
      collected: dashboard?.payments.collectedAmount ?? 0,
      due: dashboard?.payments.dueAmount ?? 0,
    };
  }, [dashboard]);

  // ── Recent activity feed ──────────────────────────────────────────────────
  const activityFeed: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];

    // Recent notifications (uses already-available list in store)
    for (const n of notifications.slice(0, 5)) {
      items.push({
        id: `notif-${n.id}`,
        type: 'notification',
        label: n.title,
        sub: 'Notification sent to students',
        date: n.date,
        icon: 'megaphone',
        iconColor: '#F59E0B',
        iconBg: '#FFFBEB',
      });
    }

    // Sort newest first, take top 8
    return items
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [notifications]);

  const parentNav = () => navigation.getParent();
  const goForm = (id?: string) => parentNav()?.navigate('AdminStudentForm', id ? { studentId: id } : undefined);

  const onLogout = () =>
    Alert.alert('Logout', 'Sign out of the admin panel?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const name = currentUser?.name ?? 'Admin';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: headerTopBg }]} edges={['left', 'right']}>
      <StatusBar
        hidden={false}
        barStyle="light-content"
        backgroundColor={Platform.OS === 'android' ? headerTopBg : undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >

        {/* ── Top header card ── */}
        <View style={styles.topPad}>
          <LinearGradient
            // Modern SaaS header: dark green → teal
            colors={['#064E3B', '#0D9488']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { paddingTop: 16 + Math.max(insets.top, 0) }]}
          >
            <View style={styles.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>DASHBOARD</Text>
                <Text style={styles.heroTitle}>Good {greeting}, {name}</Text>
                <Text style={styles.heroSub}>{format(new Date(), 'EEEE, d MMM yyyy')}</Text>
              </View>
              <TouchableOpacity onPress={onLogout} style={styles.heroIconBtn} activeOpacity={0.85}>
                <Ionicons name="log-out-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.heroKpis}>
              <KpiPill label="Total" value={loading ? '—' : String(total)} icon="people-outline" tone="indigo" />
              <KpiPill label="Today" value={loading ? '—' : String(todayCount)} icon="calendar-outline" tone="violet" />
              <KpiPill label="Active" value={loading ? '—' : String(activeCount)} icon="shield-checkmark-outline" tone="emerald" />
              <KpiPill label="Expired" value={loading ? '—' : String(expiredCount)} icon="time-outline" tone="rose" />
              <KpiPill label="Fee Due" value={loading ? '—' : String(pendingFeeCount)} icon="wallet-outline" tone="amber" />
            </View>
          </LinearGradient>
        </View>

        {/* ── Load error (graceful) ── */}
        {loadError && (
          <View style={styles.errorPill}>
            <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.errorTxt}>{loadError}</Text>
          </View>
        )}

        {/* ── Secondary row: payments + attendance ── */}
        <View style={styles.twoCol}>
          <View style={styles.card}>
            <View style={styles.cardHeadRow}>
              <View style={styles.cardTitleRow}>
                <View style={[styles.cardDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.cardTitle}>Payments</Text>
              </View>
              <Ionicons name="wallet-outline" size={18} color="#64748B" />
            </View>

            <View style={styles.payGrid}>
              <View style={styles.payMini}>
                <Text style={styles.payMiniLabel}>Collected</Text>
                <Text style={[styles.payMiniValue, { color: '#059669' }]}>₹{payments.collected}</Text>
              </View>
              <View style={styles.payMini}>
                <Text style={styles.payMiniLabel}>Due</Text>
                <Text style={[styles.payMiniValue, { color: '#D97706' }]}>₹{payments.due}</Text>
              </View>
            </View>
          </View>

          <LinearGradient colors={['#4F46E5', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.attCard}>
            <View style={styles.attTopRow}>
              <View>
                <Text style={styles.attEyebrow}>TODAY ATTENDANCE</Text>
                <Text style={styles.attLine}>
                  <Text style={styles.attBig}>{todayCount}</Text>
                  <Text style={styles.attSmall}> / {total}</Text>
                </Text>
              </View>
              <TouchableOpacity style={styles.attBtn} onPress={() => navigation.navigate('Attendance')} activeOpacity={0.85}>
                <Ionicons name="qr-code-outline" size={18} color="#fff" />
                <Text style={styles.attBtnTxt}>QR</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.attBarBg}>
              <View style={[styles.attBarFill, { width: `${Math.min(100, Math.max(0, attendancePct))}%` as any }]} />
            </View>
            <Text style={styles.attPct}>{attendancePct}% rate</Text>
          </LinearGradient>
        </View>

        {/* ── Quick actions ── */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
        </View>

        <View style={styles.actionsWrap}>
          <QuickAction2 icon="person-add-outline" label="Add student" sub="New member" tone="indigo" onPress={() => goForm()} />
          <QuickAction2 icon="people-outline" label="Students" sub="View list" tone="emerald" onPress={() => navigation.navigate('Students')} />
          <QuickAction2 icon="qr-code-outline" label="Attendance" sub="Open QR" tone="violet" onPress={() => navigation.navigate('Attendance')} />
          <QuickAction2 icon="megaphone-outline" label="Notify" sub="Send update" tone="amber" onPress={() => navigation.navigate('Notifications')} />
          <QuickAction2 icon="wallet-outline" label="Fees" sub="Overview" tone="slate" onPress={() => parentNav()?.navigate('AdminFees')} />
        </View>

        {/* ── Alerts ── */}
        {(expiredCount > 0 || blockedCount > 0 || pendingFeeCount > 0) && (
          <View style={styles.alertsWrap}>
            {expiredCount > 0 && (
              <TouchableOpacity style={[styles.alertPill, { backgroundColor: '#FEF2F2' }]} onPress={() => navigation.navigate('Students')}>
                <Ionicons name="time" size={13} color="#EF4444" />
                <Text style={[styles.alertPillTxt, { color: '#EF4444' }]}>{expiredCount} expired</Text>
              </TouchableOpacity>
            )}
            {blockedCount > 0 && (
              <TouchableOpacity style={[styles.alertPill, { backgroundColor: '#FEE2E2' }]} onPress={() => navigation.navigate('Students')}>
                <Ionicons name="ban" size={13} color="#DC2626" />
                <Text style={[styles.alertPillTxt, { color: '#DC2626' }]}>{blockedCount} blocked</Text>
              </TouchableOpacity>
            )}
            {pendingFeeCount > 0 && (
              <TouchableOpacity style={[styles.alertPill, { backgroundColor: '#FFFBEB' }]} onPress={() => parentNav()?.navigate('AdminFees')}>
                <Ionicons name="cash" size={13} color="#D97706" />
                <Text style={[styles.alertPillTxt, { color: '#D97706' }]}>{pendingFeeCount} fee due</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Recent Activity ── */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Attendance')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {activityFeed.length === 0 ? (
          <View style={styles.emptyActivity}>
            <Ionicons name="pulse-outline" size={36} color="#CBD5E1" />
            <Text style={styles.emptyTxt}>No recent activity</Text>
          </View>
        ) : (
          <View style={styles.activityCard}>
            {activityFeed.map((item, idx) => {
              let ago = '';
              try { ago = formatDistanceToNow(new Date(item.date), { addSuffix: true }); } catch { }
              const isLast = idx === activityFeed.length - 1;

              return (
                <View key={item.id} style={styles.activityItemWrap}>
                  {/* Timeline line */}
                  {!isLast && <View style={styles.timelineLine} />}

                  <View style={styles.activityItem}>
                    {/* Avatar or icon */}
                    {(item.type === 'checkin' || item.type === 'joined') ? (
                      <View style={styles.activityAvatar}>
                        {item.photoUrl
                          ? <Image source={{ uri: item.photoUrl }} style={styles.activityPhoto} />
                          : <View style={[styles.activityInitialBox, { backgroundColor: item.iconBg }]}>
                            <Text style={[styles.activityInitial, { color: item.iconColor }]}>{item.initial}</Text>
                          </View>
                        }
                        {/* Type badge on avatar */}
                        <View style={[styles.activityTypeBadge, { backgroundColor: item.iconBg }]}>
                          <Ionicons name={item.icon} size={9} color={item.iconColor} />
                        </View>
                      </View>
                    ) : (
                      <View style={[styles.activityIconBox, { backgroundColor: item.iconBg }]}>
                        <Ionicons name={item.icon} size={18} color={item.iconColor} />
                      </View>
                    )}

                    {/* Text */}
                    <View style={styles.activityBody}>
                      <Text style={styles.activityLabel} numberOfLines={1}>{item.label}</Text>
                      <Text style={styles.activitySub} numberOfLines={1}>{item.sub}</Text>
                    </View>

                    {/* Time */}
                    <Text style={styles.activityTime}>{ago}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiPill(props: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: StatTone;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const c = statTone(props.tone);
  return (
    <View style={styles.kpiPill}>
      <View style={[styles.kpiIcon, { backgroundColor: c.bg }]}>
        <Ionicons name={props.icon} size={14} color={c.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.kpiVal}>{props.value}</Text>
        <Text style={styles.kpiLbl}>{props.label}</Text>
      </View>
    </View>
  );
}

function QuickAction2(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  tone: StatTone;
  onPress: () => void;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const c = statTone(props.tone);
  return (
    <TouchableOpacity onPress={props.onPress} activeOpacity={0.86} style={styles.qa2}>
      <View style={[styles.qa2Icon, { backgroundColor: c.bg }]}>
        <Ionicons name={props.icon} size={20} color={c.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.qa2Label} numberOfLines={1}>{props.label}</Text>
        <Text style={styles.qa2Sub} numberOfLines={1}>{props.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedText} />
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(mode: 'light' | 'dark') {
  const isDark = mode === 'dark';
  const heroText = isDark ? '#fff' : '#fff';
  const heroSubText = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.78)';
  const heroMuted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.80)';
  const heroBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)';
  const heroBtnBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)';
  const heroBtnBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.24)';

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { paddingBottom: 18 },

    topPad: { paddingHorizontal: 16, paddingTop: 12 },
    heroCard: {
      borderRadius: 22,
      padding: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: heroBorder,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18 },
        android: { elevation: 8 },
      }),
    },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroEyebrow: { fontSize: 10, fontWeight: '800', color: heroMuted, letterSpacing: 1.4 },
    heroTitle: { marginTop: 6, fontSize: 22, fontWeight: '900', color: heroText, letterSpacing: -0.4 },
    heroSub: { marginTop: 4, fontSize: 12, fontWeight: '600', color: heroMuted },
    heroIconBtn: {
      width: 38, height: 38, borderRadius: 14,
      backgroundColor: heroBtnBg,
      borderWidth: 1,
      borderColor: heroBtnBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    heroKpis: {
      marginTop: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    kpiPill: {
      flexGrow: 1,
      minWidth: 140,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: heroBorder,
    },
    kpiIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    kpiVal: { fontSize: 18, fontWeight: '900', color: heroText, letterSpacing: -0.4 },
    kpiLbl: { marginTop: 1, fontSize: 11, fontWeight: '700', color: heroSubText },

    errorPill: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
    },
    errorTxt: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

    twoCol: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 16,
      marginTop: 12,
      marginBottom: 6,
    },
    card: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
    cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardDot: { width: 8, height: 8, borderRadius: 4 },
    cardTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2 },

    payGrid: { marginTop: 12, gap: 10 },
    payMini: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    payMiniLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.mutedText, textTransform: 'uppercase' },
    payMiniValue: { marginTop: 6, fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },

    attCard: {
      flex: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: heroBorder,
      padding: 14,
      overflow: 'hidden',
    },
    attTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    attEyebrow: { fontSize: 10, fontWeight: '900', color: heroSubText, letterSpacing: 1.2 },
    attLine: { marginTop: 6 },
    attBig: { fontSize: 30, fontWeight: '900', color: heroText, letterSpacing: -0.8 },
    attSmall: { fontSize: 12, fontWeight: '700', color: heroSubText },
    attBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: heroBtnBg,
      borderWidth: 1,
      borderColor: heroBtnBorder,
    },
    attBtnTxt: { fontSize: 11, fontWeight: '900', color: heroText, letterSpacing: 0.2 },
    attBarBg: { marginTop: 12, height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.26)', overflow: 'hidden' },
    attBarFill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
    attPct: { marginTop: 8, fontSize: 11, fontWeight: '800', color: heroSubText },

    actionsWrap: {
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 6,
    },
    qa2: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    qa2Icon: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    qa2Label: { fontSize: 13, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2 },
    qa2Sub: { marginTop: 2, fontSize: 11, fontWeight: '700', color: theme.colors.mutedText },

    // ── Alerts ──
    alertsWrap: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: 16, gap: 8, marginBottom: 6,
    },
    alertPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    },
    alertPillTxt: { fontSize: 11, fontWeight: '700' },

    // ── Section header ──
    sectionHead: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16, marginTop: 14, marginBottom: 10,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2 },
    seeAll: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

    // ── Activity card ──
    activityCard: {
      marginHorizontal: 16,
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: 1, borderColor: theme.colors.border,
      overflow: 'hidden',
      paddingHorizontal: 16, paddingVertical: 8,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 12 },
        android: { elevation: 3 },
      }),
    },
    activityItemWrap: { position: 'relative' },
    timelineLine: {
      position: 'absolute',
      left: 19, top: 48, bottom: 0,
      width: 1.5, backgroundColor: theme.colors.border,
    },
    activityItem: {
      flexDirection: 'row', alignItems: 'center',
      gap: 12, paddingVertical: 10,
    },

    // Avatar with badge
    activityAvatar: { position: 'relative', width: 40, height: 40, flexShrink: 0 },
    activityPhoto: { width: 40, height: 40, borderRadius: 20 },
    activityInitialBox: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    activityInitial: { fontSize: 16, fontWeight: '800' },
    activityTypeBadge: {
      position: 'absolute', bottom: -2, right: -2,
      width: 16, height: 16, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: heroText,
    },

    // Icon (for notifications etc)
    activityIconBox: {
      width: 40, height: 40, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },

    activityBody: { flex: 1, minWidth: 0 },
    activityLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
    activitySub: { fontSize: 11, fontWeight: '600', color: theme.colors.mutedText, marginTop: 1 },
    activityTime: { fontSize: 10, fontWeight: '700', color: theme.colors.mutedText, flexShrink: 0 },

    // ── Empty ──
    emptyActivity: {
      marginHorizontal: 16, backgroundColor: theme.colors.surface,
      borderRadius: 18, alignItems: 'center', paddingVertical: 32,
      borderWidth: 1, borderColor: theme.colors.border,
    },
    emptyTxt: { marginTop: 10, fontSize: 14, fontWeight: '700', color: theme.colors.mutedText },
  });
}
