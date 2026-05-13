import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiGet, apiPost, type ApiError } from '../../services/api';
import { useAppStore } from '../../store';
import { theme } from '../../theme';

// NOTE:
// Razorpay native checkout requires a custom dev client / prebuild (not Expo Go).
// This screen assumes you run via `expo run:android` / `expo run:ios`.
let RazorpayCheckout: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-razorpay');
  RazorpayCheckout = mod?.default ?? mod;
} catch {
  RazorpayCheckout = null;
}

type PlanKey = 'trial' | 'monthly' | '6month' | 'yearly';
type Plan = { id: string; key: PlanKey; title: string; price: number; sub: string };

export default function PlanSelectionScreen(props: { embedded?: boolean } = {}) {
  const { embedded = false } = props;
  const navigation = useNavigation<any>();
  const currentUser = useAppStore((s) => s.currentUser);

  const [selected, setSelected] = useState<PlanKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; plans: any[] }>(`/api/plans`);
        if (!alive) return;
        const rows: Plan[] = (res?.plans || []).map((p: any) => {
          const key = String(p.key) as PlanKey;
          const duration = Number(p.duration || 0);
          const price = Number(p.finalPrice ?? p.price ?? 0);
          const sub =
            key === 'trial'
              ? `₹${price} trial · ${duration || 0} days`
              : duration
                ? `${duration} days validity`
                : 'Pro access';
          return {
            id: String(p._id),
            key,
            title: String(p.name || key),
            price,
            sub,
          };
        });
        setPlans(rows);
        if (!selected && rows.length) setSelected(rows[0].key);
      } catch {
        if (!alive) return;
        setPlans([
          { id: 'trial', key: 'trial', title: 'Trial', price: 99, sub: '₹99 trial · 30 days' },
          { id: 'monthly', key: 'monthly', title: 'Monthly', price: 999, sub: '30 days validity' },
          { id: '6month', key: '6month', title: '6 Month', price: 4999, sub: '180 days validity' },
          { id: 'yearly', key: 'yearly', title: 'Yearly', price: 9999, sub: '365 days validity' },
        ]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  const picked = plans.find((p) => p.key === selected) || null;

  const startPayment = useCallback(
    async (plan: Plan) => {
      if (busy) return;
      if (Platform.OS === 'web') {
        Alert.alert('Not supported', 'Razorpay native checkout is not supported on web.');
        return;
      }

      if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
        Alert.alert(
          'Razorpay not available',
          'Razorpay module is not linked. Run the app with a Dev Client (expo run:android/ios) after installing react-native-razorpay.'
        );
        return;
      }

      setBusy(true);
      try {
        const order = await apiPost<{
          ok: boolean;
          orderId: string;
          keyId: string;
          amount: number; // paise
          currency: 'INR';
          planId: string;
          planKey: string;
        }>(`/api/payment/create-order`, { planId: plan.id });

        const options = {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: currentUser?.name || 'Library',
          description: `${plan.title} plan`,
          prefill: {
            name: currentUser?.ownerName || currentUser?.name || '',
            email: currentUser?.email || '',
            contact: currentUser?.phone || '',
          },
          theme: { color: theme.colors.primary },
        };

        const data = await RazorpayCheckout.open(options);
        // data: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
        const verify = await apiPost<{ ok: boolean; user?: any; message?: string }>(`/api/payment/verify`, {
          planId: plan.id,
          orderId: data.razorpay_order_id,
          paymentId: data.razorpay_payment_id,
          signature: data.razorpay_signature,
        });

        if (verify?.user) {
          useAppStore.setState({ currentUser: verify.user });
        }

        Alert.alert('Success', 'Subscription activated.');
        navigation.goBack();
      } catch (e: any) {
        // PhonePe/UPI-intent edge case: payment may succeed but SDK/verify may throw.
        // Recover by re-checking latest subscription from backend.
        try {
          const me = await apiGet<{ ok: boolean; user?: any }>(`/api/subscription/me`);
          if (me?.user) {
            useAppStore.setState({ currentUser: me.user });
            const exp = me.user?.planExpiryDate ? new Date(me.user.planExpiryDate).getTime() : null;
            const active =
              me.user?.subscriptionStatus === 'active' &&
              exp &&
              Number.isFinite(exp) &&
              Date.now() < exp;
            if (active) {
              Alert.alert('Success', 'Subscription activated.');
              navigation.goBack();
              return;
            }
          }
        } catch {
          // ignore recovery errors; show fallback error below
        }

        const err = e as ApiError;
        const msg = err?.message || 'Please try again.';
        const code = typeof (err as any)?.status === 'number' ? ` (HTTP ${(err as any).status})` : '';
        Alert.alert('Payment failed', `${msg}${code}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, currentUser, navigation]
  );

  const onPay = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Razorpay native checkout is not supported on web.');
      return;
    }
    if (!picked) {
      Alert.alert('Select a plan', 'Please select a plan');
      return;
    }
    await startPayment(picked);
  }, [picked, startPayment]);

  return (
    <SafeAreaView style={[styles.safe, embedded && styles.safeEmbedded]} edges={embedded ? [] : ['left', 'right', 'bottom']}>
      <ScrollView style={[styles.root, embedded && styles.rootEmbedded]} contentContainerStyle={styles.content}>
        {!embedded ? (
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={{ gap: 12, marginTop: 12 }}>
          {plans.map((p) => {
            const active = selected === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => {
                  setSelected(p.key);
                }}
                activeOpacity={0.9}
                style={[styles.card, active && styles.cardOn]}
                disabled={busy}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.planTitle}>{p.title}</Text>
                    <Text style={styles.planSub} numberOfLines={1}>{p.sub}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.price}>{`₹${p.price}`}</Text>
                    <Text style={styles.priceSub}>
                      {p.key === 'trial' ? '/trial' : p.key === 'monthly' ? '/month' : p.key === '6month' ? '/6 months' : '/year'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={onPay}
          activeOpacity={0.9}
          style={[
            styles.unlockBtn,
            (!picked || busy) && { opacity: 0.7 },
          ]}
          disabled={!picked || busy}
        >
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={theme.colors.surface}
          />
          <Text style={styles.unlockTxt}>
            {busy
              ? 'PLEASE WAIT…'
              : picked
                ? `Unlock · ₹${picked.price}`
                : ''}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  safeEmbedded: { backgroundColor: 'transparent' },
  root: { flex: 1, backgroundColor: theme.colors.background },
  rootEmbedded: { backgroundColor: 'transparent' },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
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
  hTitle: { fontSize: theme.text.lg, fontWeight: '900', color: theme.colors.text },
  hSub: { marginTop: 2, fontSize: theme.text.sm, fontWeight: '800', color: theme.colors.mutedText },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
  cardOn: { borderColor: theme.colors.primary },
  planTitle: { fontWeight: '900', color: theme.colors.text, fontSize: theme.text.md },
  planSub: { marginTop: 4, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },
  price: { fontWeight: '900', color: theme.colors.text, fontSize: theme.text.lg },
  priceSub: { marginTop: 2, fontWeight: '800', color: theme.colors.mutedText, fontSize: 12 },
  unlockBtn: {
    marginTop: 18,
    minHeight: 50,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  unlockTxt: { fontWeight: '900', color: theme.colors.surface, fontSize: theme.text.md },
});

