import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import LibrarySeatsScreen from '../screens/library/Seats';
import { useAppStore } from '../store';
import { theme } from '../theme';

/**
 * SeatsPage
 * - Uses existing seat grid UI unchanged.
 * - Connection: preloads seats from backend using store → Axios.
 * - Auth token is attached by Axios interceptor automatically.
 * - Loading/error handled here without changing the screen styling.
 */
export default function SeatsPage() {
  const fetchSeats = useAppStore((s) => s.fetchSeats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Backend call: GET /api/seats (token required)
        await fetchSeats();
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load seats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSeats]);

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

  return <LibrarySeatsScreen />;
}

