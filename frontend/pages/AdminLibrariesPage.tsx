import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiDelete, apiGet, apiPatch, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';
import { useNavigation } from '@react-navigation/native';

type LibraryRow = {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  plan: 'free' | 'pro';
  isActive: boolean;
  planExpiryDate: string | null;
  libraryCode?: string;
  studentCount?: number;
  subscriptionStatus?: 'active' | 'cancelled' | 'expired';
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelNote?: string | null;
};

/**
 * AdminLibrariesPage
 * - Shows libraries list (admin-only)
 * - Pagination: 10 libraries per page
 * - Actions: Block/Unblock, Delete
 */
export default function AdminLibrariesPage() {
  const navigation = useNavigation<any>();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [search, setSearch] = useState('');

  const load = useCallback(async (p: number, q?: string) => {
    setLoading(true);
    setError(null);
    try {
      /**
       * Backend connection:
       * GET /api/admin/libraries?page=&limit=10&includeCounts=1&search=
       */
      const res = await apiGet<{ ok: boolean; libraries: any[]; total: number }>(`/api/admin/libraries`, {
        page: p,
        limit: 10,
        includeCounts: 1,
        ...(q && q.trim() ? { search: q.trim() } : {}),
      });
      setRows(res.libraries || []);
      setTotal(Number(res.total || 0));
      setPage(p);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load libraries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    load(1);
  }, [isAuthenticated, role, load]);

  const canPrev = page > 1;
  const canNext = page * 10 < total && rows.length === 10;

  const onToggle = async (lib: LibraryRow) => {
    const prev = rows;
    setRows((list) => list.map((x) => (x.id === lib.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await apiPatch(`/api/admin/libraries/${lib.id}/block`, { isActive: !lib.isActive });
    } catch (e: any) {
      setRows(prev);
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to update library');
    }
  };

  const onDelete = async (lib: LibraryRow) => {
    Alert.alert('Delete', `Delete "${lib.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const prev = rows;
          setRows((list) => list.filter((x) => x.id !== lib.id));
          try {
            await apiDelete(`/api/admin/libraries/${lib.id}`);
          } catch (e: any) {
            setRows(prev);
            const err = e as ApiError;
            Alert.alert('Error', err?.message || 'Failed to delete library');
          }
        },
      },
    ]);
  };

  const header = useMemo(() => {
    return (
      <View style={styles.head}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.title}>Libraries</Text>
          <Text style={styles.sub}>{total} total · page {page}</Text>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.mutedText} />
            <TextInput
              value={search}
              onChangeText={(t) => setSearch(t)}
              placeholder="Search name / owner / libraryCode"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.searchInput}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={() => load(1, search)}
            />
            {search.trim() ? (
              <TouchableOpacity onPress={() => { setSearch(''); load(1, ''); }} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={theme.colors.mutedText} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <TouchableOpacity onPress={() => load(page)} style={styles.iconBtn} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    );
  }, [total, page, load, search]);

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
        <TouchableOpacity style={styles.primaryBtn} onPress={() => load(page)} activeOpacity={0.85}>
          <Text style={styles.primaryTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}
        renderItem={({ item }) => {
          const bg = item.isActive ? '#ECFDF5' : '#FEF2F2';
          const fg = item.isActive ? '#059669' : '#DC2626';
          const border = item.isActive ? '#A7F3D0' : '#FECACA';
          return (
            <View style={styles.card}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.meta} numberOfLines={1}>{item.ownerName} · {item.email}</Text>
              <Text style={styles.meta2} numberOfLines={1}>
                Code: {item.libraryCode || '—'} · Students: {item.studentCount ?? '—'}
              </Text>
              {item.subscriptionStatus === 'cancelled' ? (
                <View style={styles.cancelBox}>
                  <Text style={styles.cancelTxt} numberOfLines={2}>
                    Cancelled · {item.cancelReason || 'No reason'}{item.cancelNote ? ` · ${item.cancelNote}` : ''}
                  </Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
                  <Text style={[styles.badgeTxt, { color: fg }]}>{item.isActive ? 'Active' : 'Blocked'}</Text>
                </View>
                <Text style={styles.plan}>{String(item.plan).toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('AdminLibraryDetail', { libraryId: item.id })}
                    style={[styles.smallBtn, { backgroundColor: theme.colors.surface }]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.smallTxt, { color: theme.colors.text }]}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onToggle(item)} style={styles.smallBtn} activeOpacity={0.85}>
                    <Text style={styles.smallTxt}>{item.isActive ? 'Block' : 'Unblock'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDelete(item)} style={[styles.smallBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]} activeOpacity={0.85}>
                    <Text style={[styles.smallTxt, { color: '#DC2626' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.pager}>
        <TouchableOpacity disabled={!canPrev} onPress={() => load(page - 1)} style={[styles.pagerBtn, !canPrev && { opacity: 0.5 }]} activeOpacity={0.85}>
          <Text style={styles.pagerTxt}>Prev</Text>
        </TouchableOpacity>
        <Text style={styles.pagerMid}>Page {page}</Text>
        <TouchableOpacity disabled={!canNext} onPress={() => load(page + 1)} style={[styles.pagerBtn, !canNext && { opacity: 0.5 }]} activeOpacity={0.85}>
          <Text style={styles.pagerTxt}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  sub: { fontSize: 12, fontWeight: '700', color: theme.colors.mutedText, marginTop: 4 },
  searchWrap: {
    marginTop: 10,
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
    ...theme.shadow.card,
  },
  name: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  meta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
  meta2: { marginTop: 2, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
  cancelBox: {
    marginTop: 10,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 14,
    padding: 10,
  },
  cancelTxt: { color: theme.colors.text, fontWeight: '800', fontSize: 12, lineHeight: 16 },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: '900' },
  plan: { fontWeight: '900', color: theme.colors.mutedText, fontSize: 12 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#EEF2FF' },
  smallTxt: { fontWeight: '900', color: '#4338CA', fontSize: 11 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pagerBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#0F172A' },
  pagerTxt: { color: '#fff', fontWeight: '900' },
  pagerMid: { fontWeight: '900', color: theme.colors.mutedText },
  primaryBtn: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#0F172A' },
  primaryTxt: { color: '#fff', fontWeight: '900' },
});

