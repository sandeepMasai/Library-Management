import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiGet, type ApiError } from '../../services/api';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every((x) => Number.isFinite(x))) return null;
  return { r, g, b };
}

function withAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

type BillingItem =
  | {
      id: string;
      type: 'payment';
      amount: number;
      plan: 'trial' | 'monthly' | '6month' | 'yearly';
      status: 'paid' | 'failed';
      method: 'razorpay';
      invoiceUrl: string | null;
      orderId: string;
      paymentId: string;
      createdAt: string;
    }
  | {
      id: string;
      type: 'subscription';
      status: 'activated' | 'cancelled' | 'expired';
      plan: string;
      amount: number;
      reason: string | null;
      note: string | null;
      expiryDate: string | null;
      createdAt: string;
    };

function formatBillingDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = d.toLocaleString('en-US', { month: 'short' });
  const yy = d.getFullYear();
  return `${dd} ${mm} ${yy}`;
}

function money(n: number) {
  return `₹${Number(n || 0)}`;
}

function planLabel(p: string) {
  if (p === 'trial') return 'Trial Plan';
  if (p === 'monthly') return 'Monthly Plan';
  if (p === '6month') return '6 Month Plan';
  if (p === 'yearly') return 'Yearly Plan';
  return String(p || 'Plan');
}

export default function BillingHistoryScreen() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BillingItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; items: BillingItem[] }>(`/api/payment/history`);
      setItems(res.items || []);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load billing history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onInvoice = useCallback(async (row: Extract<BillingItem, { type: 'payment' }>) => {
    try {
      const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif; padding: 22px; color: #0f172a; }
      .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
      .h { font-weight: 900; font-size: 18px; margin: 0 0 12px 0; }
      .row { display:flex; justify-content:space-between; gap:10px; margin: 8px 0; }
      .k { color:#64748b; font-size:12px; font-weight:800; }
      .v { font-size:13px; font-weight:900; }
      .pill { display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid #e2e8f0; font-weight:900; font-size:12px; }
      .paid { background:#ecfdf5; border-color:#a7f3d0; color:#059669; }
      .failed { background:#fef2f2; border-color:#fecaca; color:#dc2626; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="h">Invoice</div>
      <div class="row"><div><div class="k">Plan</div><div class="v">${planLabel(row.plan)}</div></div><div style="text-align:right"><span class="pill ${row.status === 'paid' ? 'paid' : 'failed'}">${row.status.toUpperCase()}</span></div></div>
      <div class="row"><div><div class="k">Amount</div><div class="v">${money(row.amount)} INR</div></div></div>
      <div class="row"><div><div class="k">Order ID</div><div class="v">${row.orderId}</div></div></div>
      <div class="row"><div><div class="k">Payment ID</div><div class="v">${row.paymentId}</div></div></div>
      <div class="row"><div><div class="k">Date</div><div class="v">${formatBillingDate(row.createdAt)}</div></div></div>
      <div class="row"><div><div class="k">Method</div><div class="v">Razorpay</div></div></div>
    </div>
  </body>
</html>`;
      const file = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert('Saved', `PDF saved at: ${file.uri}`);
      }
    } catch (e: any) {
      Alert.alert('Invoice', e?.message || 'Could not generate invoice');
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: BillingItem }) => {
      if (item.type === 'payment') {
        const ok = item.status === 'paid';
        return (
          <View style={styles.card}>
            <View style={styles.rowTop}>
              <View style={styles.iconBox}>
                <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={18} color={ok ? theme.colors.success : theme.colors.danger} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>{`${money(item.amount)} · ${planLabel(item.plan)}`}</Text>
                <Text style={styles.meta} numberOfLines={1}>{`Paid via UPI (Razorpay) · ${formatBillingDate(item.createdAt)}`}</Text>
                <Text style={styles.meta} numberOfLines={1}>{`Order: ${item.orderId}`}</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  {
                    borderColor: ok ? withAlpha(theme.colors.success, 0.35) : withAlpha(theme.colors.danger, 0.35),
                    backgroundColor: ok ? withAlpha(theme.colors.success, 0.12) : withAlpha(theme.colors.danger, 0.12),
                  },
                ]}
              >
                <Text style={[styles.badgeTxt, { color: ok ? theme.colors.success : theme.colors.danger }]}>{ok ? 'Paid' : 'Failed'}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => onInvoice(item)} style={styles.linkBtn} activeOpacity={0.85}>
              <Ionicons name="document-text-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.linkTxt}>View Invoice (PDF)</Text>
            </TouchableOpacity>
          </View>
        );
      }

      const danger = item.status === 'cancelled' || item.status === 'expired';
      return (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.iconBox}>
              <Ionicons name={danger ? 'alert-circle' : 'checkmark-circle'} size={18} color={danger ? theme.colors.danger : theme.colors.success} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>
                {item.status === 'activated' ? 'Subscription Activated' : item.status === 'expired' ? 'Subscription Expired' : 'Subscription Cancelled'}
              </Text>
              <Text style={styles.meta} numberOfLines={2}>
                {item.status === 'cancelled' ? `Reason: ${item.reason || '—'}` : `Plan: ${planLabel(item.plan)}`}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.expiryDate ? `Valid till: ${formatBillingDate(item.expiryDate)}` : `Date: ${formatBillingDate(item.createdAt)}`}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [onInvoice]
  );

  const empty = useMemo(() => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.danger, fontWeight: '900' }}>Could not load</Text>
          <Text style={{ marginTop: 6, color: theme.colors.mutedText, fontWeight: '800', textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity onPress={load} style={[styles.linkBtn, { marginTop: 14 }]} activeOpacity={0.85}>
            <Ionicons name="refresh" size={16} color={theme.colors.primary} />
            <Text style={styles.linkTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>No billing history yet</Text>
      </View>
    );
  }, [loading, error, load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar
        translucent={false}
        barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={styles.header.backgroundColor as any}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.hTitle} numberOfLines={1}>
          Billing History
        </Text>
        <TouchableOpacity onPress={load} style={styles.hBtn} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => String((i as any).id || `${i.type}-${(i as any).orderId || (i as any).createdAt}`)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}
        ListEmptyComponent={empty}
        refreshing={loading}
        onRefresh={load}
      />
    </SafeAreaView>
  );
}

function makeStyles(mode: 'light' | 'dark') {
  const headerBg = mode === 'dark' ? theme.colors.background : withAlpha(theme.colors.primary, 0.06);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: headerBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    hBtn: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hTitle: { flex: 1, textAlign: 'center', fontWeight: '900', color: theme.colors.text, fontSize: theme.text.md },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      marginBottom: 12,
      ...theme.shadow.card,
    },
    rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    title: { fontWeight: '900', color: theme.colors.text },
    meta: { marginTop: 4, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },
    badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill },
    badgeTxt: { fontWeight: '900', fontSize: 11 },
    linkBtn: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    linkTxt: { fontWeight: '900', color: theme.colors.primary },
  });
}

