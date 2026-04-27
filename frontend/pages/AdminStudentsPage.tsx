import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';

type StudentRow = {
  id: string;
  name: string;
  mobile: string;
  username: string;
  library: { id: string; name: string } | null;
};

/**
 * AdminStudentsPage
 * - Shows ALL students across ALL libraries (admin-only)
 * - Card UI: library name + student name + mobile
 * - Pagination: 10 per page
 */
export default function AdminStudentsPage() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState<number>(0);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      /**
       * Backend connection:
       * GET /api/admin/students?page=&limit=10
       */
      const res = await apiGet<{ ok: boolean; students: StudentRow[]; total: number }>(`/api/admin/students`, { page: p, limit: 10 });
      setRows(res.students || []);
      setTotal(Number(res.total || 0));
      setPage(p);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load students');
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

  const header = useMemo(() => {
    return (
      <View style={styles.head}>
        <View>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.title}>Students</Text>
          <Text style={styles.sub}>{total} total · page {page}</Text>
        </View>
        <TouchableOpacity onPress={() => load(page)} style={styles.iconBtn} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    );
  }, [total, page, load]);

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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.libBadge}>
                <Text style={styles.libBadgeTxt} numberOfLines={1}>{item.library?.name || 'Unknown library'}</Text>
              </View>
            </View>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.mobile} · @{item.username}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>No students</Text>
          </View>
        }
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  libBadge: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: '100%' },
  libBadgeTxt: { color: '#4338CA', fontWeight: '900', fontSize: 11 },
  name: { marginTop: 10, fontSize: 16, fontWeight: '900', color: theme.colors.text },
  meta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

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

