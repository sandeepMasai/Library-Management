import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AdminAttendance from '../screens/admin/Attendance';
import { useAppStore } from '../store';
import { theme } from '../theme';

/**
 * AttendancePage
 * - Uses existing attendance UI unchanged.
 * - Connection: preloads “today attendance” (and optionally QR token) using store → Axios.
 * - Auth token is attached automatically by Axios interceptor.
 * - Loading/error handled here without touching the screen styling.
 */
export default function AttendancePage() {
  const fetchTodayAttendance = useAppStore((s) => s.fetchTodayAttendance);
  const generateDailyQr = useAppStore((s) => s.generateDailyQr);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Backend calls:
        // - GET  /api/attendance/today
        // - POST /api/attendance/token (to show the QR token in the UI)
        await Promise.all([fetchTodayAttendance(), generateDailyQr()]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load attendance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTodayAttendance, generateDailyQr]);

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

  return <AdminAttendance />;
}

