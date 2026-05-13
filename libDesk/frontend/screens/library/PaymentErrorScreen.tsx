import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../../theme';
import { apiGet, type ApiError } from '../../services/api';
import { useAppStore } from '../../store';

type Params = {
  message?: string;
  retryTo?: string;
};

export default function PaymentErrorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route?.params || {}) as Params;
  const message = (params?.message || '').trim();
  // Default retry route: PlanSelection (safe screen to restart payment).
  const retryTo = String(params?.retryTo || '').trim() || 'PlanSelection';

  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const checkStatus = useCallback(async () => {
    setCheckError(null);
    try {
      const me = await apiGet<{ ok: boolean; user?: any }>(`/api/subscription/me`);
      if (me?.user) {
        useAppStore.getState().patchCurrentUser?.(me.user);
        // Fallback if patchCurrentUser is not available (older store API)
        if (!useAppStore.getState().patchCurrentUser) {
          useAppStore.setState({ currentUser: me.user });
        }
        const exp = me.user?.planExpiryDate ? new Date(me.user.planExpiryDate).getTime() : null;
        const active =
          me.user?.subscriptionStatus === 'active' &&
          (typeof exp !== 'number' || (Number.isFinite(exp) && Date.now() < exp));
        if (active) {
          navigation.replace('PaymentSuccess');
          return { active: true };
        }
      }
      return { active: false };
    } catch (e: any) {
      const err = e as ApiError;
      setCheckError(err?.message || 'Could not refresh payment status');
      return { active: false };
    }
  }, [navigation]);

  const pollVerify = useCallback(async () => {
    // Keep user on "Verifying..." longer to avoid false failure.
    // Attempt every 1.5s for ~15s total.
    const maxAttempts = 10;
    const delayMs = 1500;
    setAttempt(0);
    for (let i = 1; i <= maxAttempts; i++) {
      setAttempt(i);
      // eslint-disable-next-line no-await-in-loop
      const res = await checkStatus();
      if (res.active) return { active: true };
      if (i < maxAttempts) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(delayMs);
      }
    }
    return { active: false };
  }, [checkStatus]);

  useEffect(() => {
    // Run once on mount.
    (async () => {
      setChecking(true);
      const res = await pollVerify();
      setChecking(false);
    })();
  }, [pollVerify]);

  // Prevent leaving verification screen while checking.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (checking) return true; // block
      return false;
    });
    return () => sub.remove();
  }, [checking]);

  const subText = useMemo(() => {
    if (checking) return `Please wait… Verifying payment (${attempt}/10)`;
    if (checkError) return checkError;
    return message || 'Payment verification is taking longer than usual. Please tap Retry.';
  }, [checking, checkError, message, attempt]);

  // Never show scary "Payment Failed" for UPI false-failure; show a softer state.
  const title = checking ? 'Please wait…' : 'Still verifying…';
  const iconName = checking ? 'time-outline' : 'information-circle';
  const iconColor = checking ? theme.colors.primary : theme.colors.primary;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.root}>
        <View style={styles.iconWrap}>
          <Ionicons name={iconName as any} size={64} color={iconColor} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subText}</Text>
        {checking ? <ActivityIndicator style={{ marginTop: 12 }} color={theme.colors.primary as any} /> : null}

        {!checking ? (
          <View style={styles.row}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.goBack()} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryTxt}>Go Back</Text>
            </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={async () => {
              // First try to refresh payment status (PhonePe intent sometimes shows false errors).
              if (retrying) return;
              setRetrying(true);
              setChecking(true);
              const res = await pollVerify();
              setChecking(false);
              if (res.active) {
                setRetrying(false);
                return;
              }
              // Navigate to a safe screen where user can start payment again.
              navigation.replace(retryTo);
              setRetrying(false);
            }}
            style={styles.btnPrimary}
            disabled={checking || retrying}
          >
            <Text style={styles.btnPrimaryTxt}>{retrying ? 'Please wait…' : 'Retry'}</Text>
          </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, padding: 18, justifyContent: 'center', alignItems: 'center' },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 20 },
  sub: { marginTop: 6, color: theme.colors.mutedText, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnSecondary: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryTxt: { color: theme.colors.text, fontWeight: '900' },
  btnPrimary: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryTxt: { color: theme.colors.surface, fontWeight: '900' },
});

