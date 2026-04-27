import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPatch, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';

type Detail = {
  id: string;
  name: string;
  libraryCode: string;
  ownerName: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string;
  isActive: boolean;
  plan: 'free' | 'pro';
  planStartDate: string | null;
  planExpiryDate: string | null;
  subscriptionStatus: 'active' | 'cancelled' | 'expired';
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelNote: string | null;
  createdAt: string | null;
};

type Stats = {
  totalSeats: number;
  totalStudents: number;
  activeStudents: number;
  revenue: number;
};

export default function AdminLibraryDetailPage() {
  const route = useRoute<any>();
  const libraryId = route.params?.libraryId as string | undefined;

  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    if (!libraryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; library: Detail; stats: Stats }>(`/api/admin/library/${libraryId}`);
      setDetail(res.library);
      setStats(res.stats);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    load();
  }, [isAuthenticated, role, load]);

  const statusBadge = useMemo(() => {
    if (!detail) return null;
    const active = detail.isActive;
    const bg = active ? '#ECFDF5' : '#FEF2F2';
    const fg = active ? '#059669' : '#DC2626';
    const border = active ? '#A7F3D0' : '#FECACA';
    return { bg, fg, border, label: active ? 'Active' : 'Blocked' };
  }, [detail]);

  if (!isAuthenticated()) return <LoginScreen />;
  if (role && role !== 'admin') return <ForbiddenScreen message="This page is only for admin accounts." />;

  if (!libraryId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Missing library id</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
      </View>
    );
  }

  if (error || !detail || !stats) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background, padding: 18 }]}>
        <Text style={{ color: theme.colors.danger, fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{error || 'Unknown error'}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={load} activeOpacity={0.85}>
          <Text style={styles.primaryTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* One card style (student-card like) */}
      <View style={styles.libraryCard}>
        <View style={styles.libraryTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>LIBRARY DETAIL</Text>
            <Text style={styles.title} numberOfLines={1}>
              {detail.name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              Code: {detail.libraryCode} · {detail.city}
            </Text>
          </View>
          {statusBadge ? (
            <View style={[styles.badge, { backgroundColor: statusBadge.bg, borderColor: statusBadge.border }]}>
              <Text style={[styles.badgeTxt, { color: statusBadge.fg }]}>{statusBadge.label}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.libraryMetaRow}>
          <Pill label={`Plan: ${String(detail.plan).toUpperCase()}`} />
          <Pill label={`Expiry: ${detail.planExpiryDate ? detail.planExpiryDate.slice(0, 10) : '—'}`} />
          <Pill label={`Sub: ${detail.subscriptionStatus}`} />
        </View>

        <View style={styles.libraryGrid}>
          <SmallStat label="Seats" value={stats.totalSeats} />
          <SmallStat label="Students" value={stats.totalStudents} />
          <SmallStat label="Active" value={stats.activeStudents} />
          <SmallStat label="Revenue" value={`₹${stats.revenue}`} />
        </View>

        <View style={styles.divider} />

        <InfoRow icon="person-outline" label="Owner" value={detail.ownerName} />
        <InfoRow icon="mail-outline" label="Email" value={detail.email} />
        <InfoRow icon="call-outline" label="Phone" value={detail.phone || '—'} />
        <InfoRow icon="home-outline" label="Address" value={detail.address || '—'} />

        {detail.subscriptionStatus === 'cancelled' ? (
          <View style={styles.cancelBox}>
            <Text style={styles.cancelTitle}>Cancellation</Text>
            <Text style={styles.cancelTxt}>
              {detail.cancelReason || '—'}
              {detail.cancelNote ? ` · ${detail.cancelNote}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>ACTIONS</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.actionBtn}
          onPress={async () => {
            const next = !detail.isActive;
            try {
              await apiPatch(`/api/admin/libraries/${detail.id}/block`, { isActive: next });
              Alert.alert('Updated', next ? 'Library activated' : 'Library blocked');
              load();
            } catch (e: any) {
              const err = e as ApiError;
              Alert.alert('Error', err?.message || 'Failed to update');
            }
          }}
        >
          <Ionicons name={detail.isActive ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={theme.colors.text} />
          <Text style={styles.actionTxt}>{detail.isActive ? 'Block' : 'Activate'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Pill(props: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillTxt} numberOfLines={1}>
        {props.label}
      </Text>
    </View>
  );
}

function SmallStat(props: { label: string; value: string | number }) {
  return (
    <View style={styles.smallStat}>
      <Text style={styles.smallStatVal} numberOfLines={1}>
        {props.value}
      </Text>
      <Text style={styles.smallStatLab} numberOfLines={1}>
        {props.label}
      </Text>
    </View>
  );
}

function InfoRow(props: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { icon, label, value } = props;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={18} color={theme.colors.mutedText} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function StatCard(props: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statVal}>{props.value}</Text>
      <Text style={styles.statLab}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  sub: { marginTop: 4, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },

  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: '900' },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
    ...theme.shadow.card,
  },
  libraryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
    ...theme.shadow.card,
  },
  libraryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  libraryMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.text },
  libraryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  smallStat: {
    width: '48%',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 12,
  },
  smallStatVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  smallStatLab: { marginTop: 4, fontSize: 11, fontWeight: '800', color: theme.colors.mutedText },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, gap: 10 },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  infoLabel: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '800', color: theme.colors.text },

  sectionTitle: { marginTop: 8, marginBottom: 10, color: theme.colors.mutedText, fontWeight: '900', letterSpacing: 1.1, fontSize: 12 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    ...theme.shadow.card,
  },
  statVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  statLab: { marginTop: 4, fontSize: 11, fontWeight: '800', color: theme.colors.mutedText },

  cancelBox: {
    marginTop: 10,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 14,
    padding: 10,
  },
  cancelTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
  cancelTxt: { marginTop: 6, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText, lineHeight: 16 },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    paddingVertical: 12,
  },
  actionTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },

  primaryBtn: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#0F172A' },
  primaryTxt: { color: '#fff', fontWeight: '900' },
});

