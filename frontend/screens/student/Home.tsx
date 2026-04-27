import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import LibraryCard from '../../components/LibraryCard';
import { CATEGORY_META, resolveNotificationCategory } from '../../constants/notificationCategoryUi';
import { theme } from '../../theme';
import { apiGet, type ApiError } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';

export default function StudentHome() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const currentUser = useAppStore((s) => s.currentUser);
  const role = useAppStore((s) => s.role);
  const attendances = useAppStore((s) => s.attendances);
  const notifications = useAppStore((s) => s.notifications);
  const users = useAppStore((s) => s.users);
  const getStudentNotifications = useAppStore((s) => s.getStudentNotifications);
  const fetchNotifications = useAppStore((s) => s.fetchNotifications);
  const fetchStudentAttendance = useAppStore((s) => s.fetchStudentAttendance);
  const scrollBottom = useScrollBottomForTabBar();
  const logout = useAppStore((s) => s.logout);

  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // Student bootstrap: when token/role exists but currentUser isn't hydrated (e.g. app reload),
  // fetch /api/student/me once so Home/Profile screens can render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (currentUser) return;
      if (role !== 'student') return;
      setBootLoading(true);
      setBootError(null);
      try {
        const data = await apiGet<any>(`/api/student/me`);
        if (!data?.student?.id) throw new Error('Invalid student payload');
        useAppStore.setState((s) => ({
          currentUser: data.student,
          users: [...s.users.filter((u) => u.id !== data.student.id), data.student],
          notifications: Array.isArray(data.notifications) ? data.notifications : s.notifications,
        }));
        await fetchStudentAttendance(data.student.id);
      } catch (e: any) {
        const err = e as ApiError;
        if (!cancelled) setBootError(err?.message || 'Failed to load student profile');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, role, fetchStudentAttendance]);

  useFocusEffect(
    useCallback(() => {
      if (currentUser) {
        fetchNotifications(currentUser.id);
        fetchStudentAttendance(currentUser.id);
      }
    }, [currentUser, fetchNotifications, fetchStudentAttendance])
  );

  const studentAttendances = useMemo(
    () => (currentUser ? attendances.filter((a) => a.studentId === currentUser.id) : []),
    [attendances, currentUser]
  );

  const attendancePct = useMemo(() => {
    const d = new Date().getDate();
    return Math.min(100, Math.round((studentAttendances.length / Math.max(1, d)) * 100));
  }, [studentAttendances]);

  const recentActivity = useMemo(() => {
    if (!currentUser) return [];
    return [...getStudentNotifications(currentUser.id)]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4);
  }, [currentUser, getStudentNotifications, notifications, users]);

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          {bootLoading ? (
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
          ) : bootError ? (
            <>
              <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{bootError}</Text>
              <TouchableOpacity
                onPress={logout}
                activeOpacity={0.85}
                style={{ marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.primary }}
              >
                <Text style={{ color: theme.colors.dark, fontWeight: '900' }}>Logout</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const daysLeft = differenceInDays(new Date(currentUser.expiryDate), new Date());
  const isExpired = daysLeft < 0;
  const isExpiringSoon = !isExpired && daysLeft <= 7;
  const libraryName = currentUser.library?.libraryName || 'Library';
  const studentName = currentUser.name || 'Student';
  const studentMobile = currentUser.mobile || '';

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottom + 24 }}
      >
        {/* ─────────────────────────────────────────
            SECTION 1 · Library Card (HERO, at top)
        ───────────────────────────────────────── */}
        <View style={styles.cardSection}>
          <View style={styles.identityBar}>
            <View style={styles.identityLeft}>
              <View style={styles.identityIcon}>
                <Ionicons name="library-outline" size={16} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.identityTitle} numberOfLines={1}>
                  {libraryName}
                </Text>
                <Text style={styles.identitySub} numberOfLines={1}>
                  {studentName}
                  {studentMobile ? `  ·  ${studentMobile}` : ''}
                </Text>
              </View>
            </View>
          </View>
          <LibraryCard user={currentUser} />
        </View>

        {/* ─────────────────────────────────────────
            SECTION 3 · Stat pills
        ───────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatPill
            styles={styles}
            icon="time-outline"
            label="Days Left"
            value={isExpired ? 'Expired' : `${daysLeft}`}
            valueColor={isExpired ? theme.colors.danger : isExpiringSoon ? theme.colors.warning : theme.colors.success}
            bg={
              isExpired
                ? 'rgba(239,68,68,0.16)'
                : isExpiringSoon
                  ? 'rgba(245,158,11,0.16)'
                  : 'rgba(34,197,94,0.16)'
            }
            border={
              isExpired
                ? 'rgba(239,68,68,0.28)'
                : isExpiringSoon
                  ? 'rgba(245,158,11,0.28)'
                  : 'rgba(34,197,94,0.28)'
            }
          />
          <StatPill
            styles={styles}
            icon="checkmark-circle-outline"
            label="Attendance"
            value={`${attendancePct}%`}
            valueColor={theme.colors.primary}
            bg={mode === 'dark' ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.10)'}
            border={mode === 'dark' ? 'rgba(13,148,136,0.28)' : 'rgba(13,148,136,0.22)'}
          />
          <StatPill
            styles={styles}
            icon="cash-outline"
            label="Fee"
            value={currentUser.feeStatus === 'Half Paid' ? 'Half' : currentUser.feeStatus}
            valueColor={
              currentUser.feeStatus === 'Paid'
                ? theme.colors.success
                : currentUser.feeStatus === 'Half Paid'
                  ? theme.colors.warning
                  : theme.colors.danger
            }
            bg={
              currentUser.feeStatus === 'Paid'
                ? 'rgba(34,197,94,0.16)'
                : currentUser.feeStatus === 'Half Paid'
                  ? 'rgba(245,158,11,0.16)'
                  : 'rgba(239,68,68,0.16)'
            }
            border={
              currentUser.feeStatus === 'Paid'
                ? 'rgba(34,197,94,0.28)'
                : currentUser.feeStatus === 'Half Paid'
                  ? 'rgba(245,158,11,0.28)'
                  : 'rgba(239,68,68,0.28)'
            }
          />
        </View>

        {/* ─────────────────────────────────────────
            SECTION 4 · Big scan CTA
        ───────────────────────────────────────── */}
        <View style={styles.px}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Scan Attendance')}
            activeOpacity={0.88}
            style={styles.scanBtn}
          >
            <LinearGradient
              colors={['#4F46E5', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scanGrad}
            >
              <View style={styles.scanIconWrap}>
                <Ionicons name="qr-code-outline" size={28} color="#fff" />
              </View>
              <View style={styles.scanText}>
                <Text style={styles.scanTitle}>Scan Attendance</Text>
                <Text style={styles.scanSub}>Tap to mark today's visit</Text>
              </View>
              <View style={styles.scanArrow}>
                <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.8)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ─────────────────────────────────────────
            SECTION 5 · Membership alert (conditional)
        ───────────────────────────────────────── */}
        {(isExpired || isExpiringSoon) && (
          <View style={styles.px}>
            <LinearGradient
              colors={isExpired ? ['#991B1B', '#B91C1C'] : ['#92400E', '#B45309']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.alert}
            >
              <View style={styles.alertIcon}>
                <Ionicons
                  name={isExpired ? 'alert-circle' : 'hourglass-outline'}
                  size={22}
                  color="#fff"
                />
              </View>
              <View style={styles.alertBody}>
                <Text style={styles.alertTitle}>
                  {isExpired ? 'Membership Expired' : `Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                </Text>
                <Text style={styles.alertSub}>
                  {isExpired
                    ? 'Please visit the library to renew.'
                    : 'Contact library to renew before expiry.'}
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ─────────────────────────────────────────
            SECTION 7 · Recent Activity
        ───────────────────────────────────────── */}
        <View style={styles.px}>
          <SectionHeader styles={styles} title="Recent Activity" />
          <View style={styles.actCard}>
            {recentActivity.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="newspaper-outline" size={32} color={theme.colors.mutedText} />
                </View>
                <Text style={styles.emptyTitle}>No updates yet</Text>
                <Text style={styles.emptySub}>Library announcements will appear here.</Text>
              </View>
            ) : (
              recentActivity.map((n, i) => {
                const isSystem = n.id.startsWith('sys-');
                const cat = resolveNotificationCategory(n.category, isSystem);
                const meta = CATEGORY_META[cat];
                return (
                  <View
                    key={n.id}
                    style={[styles.actRow, i < recentActivity.length - 1 && styles.actRowBorder]}
                  >
                    <View style={[styles.actIconBox, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                      <Ionicons name={meta.icon} size={17} color={meta.color} />
                    </View>
                    <View style={styles.actContent}>
                      <View style={styles.actHead}>
                        <Text style={styles.actTitle} numberOfLines={1}>{n.title}</Text>
                        <View style={[styles.catChip, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.catChipText, { color: meta.color }]}>{meta.short}</Text>
                        </View>
                      </View>
                      {!!n.message && (
                        <Text style={styles.actMsg} numberOfLines={2}>{n.message}</Text>
                      )}
                      <Text style={styles.actTime}>{format(new Date(n.date), 'dd MMM · hh:mm a')}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ styles, title }: { styles: ReturnType<typeof makeStyles>; title: string }) {
  return (
    <View style={styles.secHeader}>
      <View style={styles.secDot} />
      <Text style={styles.secTitle}>{title}</Text>
    </View>
  );
}

function StatPill({
  styles,
  icon, label, value, valueColor, bg, border,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor: string;
  bg: string;
  border: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons name={icon} size={16} color={valueColor} />
      <Text style={[styles.pillValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    px: { paddingHorizontal: 16, marginBottom: 16 },

    // ── Card section ──
    cardSection: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      shadowColor: '#4338CA',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    identityBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    identityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    identityIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(99,102,241,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(99,102,241,0.22)',
    },
    identityTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2 },
    identitySub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

    // ── Stats row ──
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      marginTop: 2,
      marginBottom: 16,
    },
    pill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      gap: 4,
    },
    pillValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
    pillLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.mutedText, letterSpacing: 0.2 },

    // ── Scan CTA ──
    scanBtn: {
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
      marginBottom: 16,
    },
    scanGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 18,
      paddingHorizontal: 20,
      gap: 14,
    },
    scanIconWrap: {
      width: 50,
      height: 50,
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanText: { flex: 1 },
    scanTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
    scanSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 3 },
    scanArrow: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Section header ──
    secHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      marginTop: 4,
    },
    secDot: {
      width: 4,
      height: 18,
      borderRadius: 2,
      backgroundColor: theme.colors.primary,
    },
    secTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.2,
    },

    // ── Alert ──
    alert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 5,
    },
    alertIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertBody: { flex: 1 },
    alertTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
    alertSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 17 },

    // ── Activity card ──
    actCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      shadowColor: '#4338CA',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 12,
      elevation: 3,
    },
    actRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    actRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    actIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      marginTop: 1,
    },
    actContent: { flex: 1, minWidth: 0 },
    actHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    actTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, lineHeight: 19 },
    catChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
    catChipText: { fontSize: 9, fontWeight: '800' },
    actMsg: { marginTop: 4, fontSize: 12, color: theme.colors.mutedText, fontWeight: '500', lineHeight: 17 },
    actTime: { marginTop: 5, fontSize: 11, color: theme.colors.mutedText, fontWeight: '600' },

    // ── Empty state ──
    empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 24,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { marginTop: 14, fontSize: 16, fontWeight: '800', color: theme.colors.text },
    emptySub: { marginTop: 6, fontSize: 13, color: theme.colors.mutedText, textAlign: 'center', lineHeight: 19 },
  });
}
