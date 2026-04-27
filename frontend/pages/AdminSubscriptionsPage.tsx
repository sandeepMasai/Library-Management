import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiGet, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';

type SubscriptionRow = {
  id: string;
  libraryId: string;
  libraryName: string;
  libraryCode: string;
  ownerName: string;
  email: string;
  plan: 'free' | 'monthly' | '6month' | 'yearly' | 'pro';
  price: number;
  startDate: string | null;
  expiryDate: string | null;
  status: 'active' | 'expired' | 'cancelled';
  paymentStatus: 'paid' | 'pending';
  isActive: boolean;
};

/**
 * AdminSubscriptionsPage
 * - Admin-only subscriptions list with Active/Expired filter.
 * - Backend: GET /api/admin/subscriptions?status=active|expired
 */
export default function AdminSubscriptionsPage() {
  const navigation = useNavigation<any>();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'cancelled'>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; rows: SubscriptionRow[] }>(`/api/admin/subscriptions`, {
        status: statusFilter,
        paymentStatus: payFilter,
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      setRows(res.rows || []);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, payFilter, search]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    load();
  }, [isAuthenticated, role, load]);

  const formatDate = useCallback((iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = d.toLocaleString('en-US', { month: 'short' });
    return `${dd} ${mm}`;
  }, []);

  const planLabel = useCallback((p: SubscriptionRow['plan']) => {
    if (p === 'monthly') return 'Monthly';
    if (p === '6month') return '6 Month';
    if (p === 'yearly') return 'Yearly';
    if (p === 'pro') return 'PRO';
    return 'Free';
  }, []);

  const planTypeBadge = useCallback((p: SubscriptionRow['plan']) => {
    if (p === 'free') return { bg: '#F8FAFC', fg: '#334155', border: '#E2E8F0', label: 'Free' };
    return { bg: '#EEF2FF', fg: '#4338CA', border: '#C7D2FE', label: 'Pro' };
  }, []);

  const libStatusBadge = useCallback((active: boolean) => {
    if (!active) return { bg: '#FEF2F2', fg: '#DC2626', border: '#FECACA', label: 'Blocked' };
    return { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0', label: 'Active' };
  }, []);

  const statusBadge = useCallback((s: SubscriptionRow['status']) => {
    if (s === 'expired') return { bg: '#FEF2F2', fg: '#DC2626', border: '#FECACA', label: 'Expired' };
    if (s === 'cancelled') return { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A', label: 'Cancelled' };
    return { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0', label: 'Active' };
  }, []);

  const payBadge = useCallback((p: SubscriptionRow['paymentStatus']) => {
    if (p === 'pending') return { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA', label: 'Pending' };
    return { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0', label: 'Paid' };
  }, []);

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
        <TouchableOpacity onPress={load} style={styles.iconBtn} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.colors.mutedText} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search library name / code"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.searchInput}
          autoCapitalize="characters"
          returnKeyType="search"
          onSubmitEditing={load}
        />
        {search.trim() ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={theme.colors.mutedText} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 10 }}>
        {(['all', 'active', 'expired', 'cancelled'] as const).map((k) => {
          const active = statusFilter === k;
          const label = k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1);
          return (
            <TouchableOpacity key={k} onPress={() => setStatusFilter(k)} style={[styles.filterBtn, active && styles.filterBtnActive]} activeOpacity={0.85}>
              <Text style={[styles.filterTxt, active && styles.filterTxtActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['all', 'paid', 'pending'] as const).map((k) => {
          const active = payFilter === k;
          const label = k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1);
          return (
            <TouchableOpacity key={k} onPress={() => setPayFilter(k)} style={[styles.filterBtn, active && styles.filterBtnActive]} activeOpacity={0.85}>
              <Text style={[styles.filterTxt, active && styles.filterTxtActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.card}>
        {rows.map((r) => {
          const sb = statusBadge(r.status);
          const pb = payBadge(r.paymentStatus);
          const pt = planTypeBadge(r.plan);
          const ls = libStatusBadge(Boolean(r.isActive));
          const showActiveOnce = Boolean(r.isActive) && r.status === 'active';
          return (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('AdminSubscriptionDetail', { libraryId: r.libraryId })}
              style={styles.row}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{r.libraryName}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {r.libraryCode} · {planLabel(r.plan)} (₹{r.price}) · {r.ownerName}
                </Text>
                <Text style={styles.meta2} numberOfLines={1}>
                  Join: {formatDate(r.startDate)} · Expiry: {formatDate(r.expiryDate)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                {showActiveOnce ? (
                  <View style={[styles.badge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Text style={[styles.badgeTxt, { color: '#059669' }]}>Active</Text>
                  </View>
                ) : null}
                {!r.isActive ? (
                  <View style={[styles.badge, { backgroundColor: ls.bg, borderColor: ls.border }]}>
                    <Text style={[styles.badgeTxt, { color: ls.fg }]}>{ls.label}</Text>
                  </View>
                ) : null}
                <View style={[styles.badge, { backgroundColor: pt.bg, borderColor: pt.border }]}>
                  <Text style={[styles.badgeTxt, { color: pt.fg }]}>{pt.label}</Text>
                </View>
                {!showActiveOnce && r.status !== 'active' ? (
                  <View style={[styles.badge, { backgroundColor: sb.bg, borderColor: sb.border }]}>
                    <Text style={[styles.badgeTxt, { color: sb.fg }]}>{sb.label}</Text>
                  </View>
                ) : null}
                {r.paymentStatus !== 'paid' ? (
                  <View style={[styles.badge, { backgroundColor: pb.bg, borderColor: pb.border }]}>
                    <Text style={[styles.badgeTxt, { color: pb.fg }]}>{pb.label}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedText} />
              </View>
            </TouchableOpacity>
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '800', color: theme.colors.text, paddingVertical: 10 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  filterBtnActive: { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' },
  filterTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText },
  filterTxtActive: { color: '#4338CA' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 12, ...theme.shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  name: { fontWeight: '900', color: theme.colors.text },
  meta: { marginTop: 3, fontWeight: '700', color: theme.colors.mutedText, fontSize: 12 },
  meta2: { marginTop: 2, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { fontWeight: '900', fontSize: 11 },
});

