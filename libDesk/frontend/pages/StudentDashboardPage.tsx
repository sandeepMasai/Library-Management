import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { apiGet, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';

/**
 * StudentDashboardPage
 * - Simple UI page for students (no styling changes to other screens).
 * - Connection: GET /api/student/me (token required via Axios interceptor).
 * - Shows: name, seat, fee status, attendance.
 * - Restrict: student role only.
 */
export default function StudentDashboardPage() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);
  const logout = useAppStore((s) => s.logout);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'student') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Backend call: GET /api/student/me
        const res = await apiGet<any>(`/api/student/me`);
        if (!res?.student?.id) throw new Error('Invalid student payload');
        if (!cancelled) setData(res);
      } catch (e: any) {
        const err = e as ApiError;
        if (!cancelled) setError(err?.message || 'Failed to load student dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, role]);

  const name = data?.student?.name ?? 'Student';
  const seatNumber = data?.seat?.number ?? null;
  const feeStatus = data?.student?.feeStatus ?? '—';
  const markedToday = Boolean(data?.attendance?.markedToday);
  const month = data?.attendance?.month ?? '';
  const monthCount = Number(data?.attendance?.monthCount ?? 0);

  const feeTone = useMemo(() => {
    if (feeStatus === 'Paid') return { fg: '#059669', bg: '#ECFDF5', border: '#A7F3D0' };
    if (feeStatus === 'Half Paid') return { fg: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
    return { fg: '#DC2626', bg: '#FEF2F2', border: '#FECACA' };
  }, [feeStatus]);

  if (!isAuthenticated()) return <LoginScreen />;
  if (role && role !== 'student') return <ForbiddenScreen message="This page is only for student accounts." />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
        <Text style={{ color: theme.colors.danger, fontWeight: '800', marginBottom: 6 }}>Could not load</Text>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Student Dashboard</Text>
        <Text style={styles.name}>{name}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Seat</Text>
          <Text style={styles.value}>{seatNumber ? `#${seatNumber}` : 'Not assigned'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Fee status</Text>
          <View style={[styles.badge, { backgroundColor: feeTone.bg, borderColor: feeTone.border }]}>
            <Text style={[styles.badgeTxt, { color: feeTone.fg }]}>{feeStatus}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Attendance</Text>
          <Text style={styles.value}>
            {markedToday ? 'Marked today' : 'Not marked today'}{month ? ` · ${monthCount} this month (${month})` : ''}
          </Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.85}>
          <Text style={styles.logoutTxt}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: 18, justifyContent: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginBottom: 10 },
  name: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  label: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '800', color: theme.colors.text },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { fontSize: 12, fontWeight: '900' },
  logoutBtn: {
    marginTop: 10,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutTxt: { color: '#fff', fontWeight: '900' },
});

