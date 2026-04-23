import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AdminStudents from '../screens/admin/Students';
import { useAppStore } from '../store';
import { theme } from '../theme';

/**
 * StudentsPage
 * - Uses existing Students screen unchanged.
 * - Connection: this page triggers the first backend fetch via Zustand store,
 *   which internally uses the central Axios service (auth token attached).
 * - Loading/error are handled here so the underlying UI screen styling stays unchanged.
 */
export default function StudentsPage() {
  const fetchStudentsPage = useAppStore((s) => s.fetchStudentsPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Backend call: GET /api/students?page=1&limit=20 (token required)
        await fetchStudentsPage(1, 20);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load students');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStudentsPage]);

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

  return <AdminStudents />;
}

