import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AdminNotifications from '../screens/admin/Notifications';
import { useAppStore } from '../store';
import { theme } from '../theme';

/**
 * NotificationsPage
 * - Uses existing notifications UI unchanged.
 * - Connection: preloads first page of notifications using store → Axios.
 * - Uses auth token automatically via Axios interceptor.
 * - Loading/error handled in page so screen UI stays intact.
 */
export default function NotificationsPage() {
  const fetchNotificationsPage = useAppStore((s) => s.fetchNotificationsPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Backend call: GET /api/notifications?page=1&limit=20 (token required)
        await fetchNotificationsPage(1, 20);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load notifications');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchNotificationsPage]);

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

  return <AdminNotifications />;
}

