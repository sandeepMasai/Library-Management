import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';

type SubscriptionRow = {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  expiryDate: string | null;
  status: 'active' | 'expired';
};

/**
 * AdminSubscriptionsPage
 * - Admin-only subscriptions list with Active/Expired filter.
 * - Backend: GET /api/admin/subscriptions?status=active|expired
 */
export default function AdminSubscriptionsPage() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [filter, setFilter] = useState<'active' | 'expired'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);

  const load = useCallback(async (f: 'active' | 'expired') => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; rows: SubscriptionRow[] }>(`/api/admin/subscriptions`, { status: f });
      setRows(res.rows || []);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    load(filter);
  }, [isAuthenticated, role, filter, load]);

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
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
      <View style={styles.head}>
        <View>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.title}>Subscriptions</Text>
        </View>
        <TouchableOpacity onPress={() => load(filter)} style={styles.iconBtn} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setFilter('active')} style={[styles.filterBtn, filter === 'active' && styles.filterBtnActive]} activeOpacity={0.85}>
          <Text style={[styles.filterTxt, filter === 'active' && styles.filterTxtActive]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('expired')} style={[styles.filterBtn, filter === 'expired' && styles.filterBtnActive]} activeOpacity={0.85}>
          <Text style={[styles.filterTxt, filter === 'expired' && styles.filterTxtActive]}>Expired</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {rows.map((r) => {
          const isExpired = r.status === 'expired';
          const bg = isExpired ? '#FEF2F2' : '#ECFDF5';
          const fg = isExpired ? '#DC2626' : '#059669';
          const border = isExpired ? '#FECACA' : '#A7F3D0';
          return (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{r.email} · {String(r.plan).toUpperCase()}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
                <Text style={[styles.badgeTxt, { color: fg }]}>{isExpired ? 'Expired' : 'Active'}</Text>
              </View>
            </View>
          );
        })}
        {rows.length === 0 && (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>No rows</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  filterBtnActive: { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' },
  filterTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText },
  filterTxtActive: { color: '#4338CA' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 12, ...theme.shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  name: { fontWeight: '900', color: theme.colors.text },
  meta: { marginTop: 3, fontWeight: '700', color: theme.colors.mutedText, fontSize: 12 },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { fontWeight: '900', fontSize: 11 },
});

