import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useAppStore } from '../store';
import AdminDashboard from '../screens/admin/Dashboard';
import StudentDashboardPage from './StudentDashboardPage';
import { theme } from '../theme';
import { apiGet, type ApiError } from '../services/api';

/**
 * DashboardPage
 * - Keeps existing layouts by delegating to existing screens.
 * - Chooses which dashboard to show by role.
 * - Connection: preloads library/admin dashboard stats from backend using Axios.
 */
export default function DashboardPage() {
  const role = useAppStore((s) => s.role);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Persisted auth is hydrated by Zustand automatically.
    // This small delay prevents brief “unknown role” flash on web reload.
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>Loading…</Text>
      </View>
    );
  }

  if (!isAuthenticated()) return null;

  if (role === 'student') return <StudentDashboardPage />;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        // Backend call: GET /api/dashboard (token required)
        await apiGet(`/api/dashboard`);
      } catch (e: any) {
        const err = e as ApiError;
        if (!cancelled) setError(err?.message || 'Failed to load dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background, padding: 18 }}>
        <Text style={{ color: theme.colors.danger, fontWeight: '800', marginBottom: 6 }}>Could not load</Text>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  // admin + library use the same dashboard UI
  return <AdminDashboard />;
}

