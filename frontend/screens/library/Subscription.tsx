import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subColors, subRadius, subShadow, subSpacing } from '../../ui/subscriptionTheme';
import { useAppStore } from '../../store';

/**
 * Subscription screen
 *
 * Premium UI (no backend logic yet)
 * - Dark premium design
 * - Trial countdown timer (dynamic, updates every second)
 * - Feature list cards
 * - Plan selection (yearly/monthly) with best value highlight
 * - CTA button
 */
export default function SubscriptionScreen() {
  const currentUser = useAppStore((s) => s.currentUser);
  const upgradeSubscription = useAppStore((s) => s.upgradeSubscription);

  // Trial expiry (from backend). If null, treat as no active trial countdown.
  const expiryDate = currentUser?.planExpiryDate ?? null;
  const plan = (currentUser?.plan || 'free') as 'free' | 'pro';

  const [selected, setSelected] = useState<'trial' | 'yearly' | 'monthly'>('yearly');
  const [tick, setTick] = useState(0);
  const [upgrading, setUpgrading] = useState(false);

  // Update countdown every second
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!expiryDate) return { h: 0, m: 0, s: 0 };
    const end = new Date(expiryDate).getTime();
    const ms = Math.max(0, (Number.isFinite(end) ? end : 0) - Date.now());
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryDate, tick]);

  const onUnlock = async () => {
    // Map premium UI selection to backend planKey values.
    const planKey = selected === 'trial' ? 'free_trial' : selected === 'yearly' ? 'pro_yearly' : 'pro_monthly';
    setUpgrading(true);
    const res = await upgradeSubscription(planKey);
    setUpgrading(false);

    if (!res.ok) {
      Alert.alert('Error', res.message || 'Failed to upgrade');
      return;
    }
    Alert.alert('Success', 'Pro unlocked.');
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.kicker}>PREMIUM ACCESS · PRO</Text>
        <Text style={styles.title}>TrackMyLibrary</Text>
      </View>

      {/* Trial countdown banner */}
      {expiryDate ? (
        <View style={styles.trialCard}>
          <Text style={styles.trialTxt}>
            TRIAL EXPIRES IN: {remaining.h}H {String(remaining.m).padStart(2, '0')}M {String(remaining.s).padStart(2, '0')}S
          </Text>
        </View>
      ) : (
        <View style={[styles.trialCard, { backgroundColor: 'rgba(239,68,68,0.16)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }]}>
          <Text style={styles.trialTxt}>TRIAL: NOT ACTIVE</Text>
        </View>
      )}

      {/* Trust badge */}
      <View style={styles.trustRow}>
        <View style={styles.trustPill}>
          <Ionicons name="shield-checkmark-outline" size={16} color={subColors.accent} />
          <Text style={styles.trustTxt}>Trusted by libraries • Secure payments</Text>
        </View>
      </View>

      {/* Features */}
      <Text style={styles.sectionTitle}>WHAT YOU GET</Text>
      <View style={{ gap: subSpacing.gap }}>
        <FeatureItem
          icon="people-outline"
          title="Add Unlimited Students"
          subtitle="No limits on student records"
        />
        <FeatureItem
          icon="chatbubble-ellipses-outline"
          title="Auto WhatsApp Reminders"
          subtitle="Automated fee & expiry reminders"
        />
        <FeatureItem
          icon="receipt-outline"
          title="Send Fee Receipt on WhatsApp"
          subtitle="One-tap receipts for members"
        />
        <FeatureItem
          icon="lock-closed-outline"
          title="100% Secure Data"
          subtitle="Your data stays protected"
        />
      </View>

      {/* Plan selection */}
      <Text style={styles.sectionTitle}>CHOOSE YOUR PLAN</Text>
      <View style={{ gap: subSpacing.gap }}>
        <PlanOption
          selected={selected === 'trial'}
          title="Free Trial"
          price="₹0 / 1 month"
          sub="Try premium features free"
          onPress={() => setSelected('trial')}
        />
        <PlanOption
          selected={selected === 'yearly'}
          best
          title="Yearly Plan"
          price="₹9999/year"
          onPress={() => setSelected('yearly')}
        />
        <PlanOption
          selected={selected === 'monthly'}
          title="Monthly Plan"
          price="₹1500/month"
          sub="Pay monthly"
          onPress={() => setSelected('monthly')}
        />
      </View>

      {/* CTA */}
      <PrimaryButton
        title={
          upgrading
            ? 'PLEASE WAIT…'
            : plan === 'pro'
              ? 'YOU ARE PRO'
              : selected === 'trial'
                ? 'START FREE TRIAL'
                : 'UNLOCK PRO ACCESS'
        }
        onPress={onUnlock}
        disabled={upgrading || plan === 'pro'}
      />
      <Text style={styles.footer}>Risk-free. Cancel anytime</Text>
    </ScrollView>
  );
}

function FeatureItem(props: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  const { icon, title, subtitle } = props;
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={18} color={subColors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

function PlanOption(props: {
  selected: boolean;
  best?: boolean;
  title: string;
  price: string;
  sub?: string;
  onPress: () => void;
}) {
  const { selected, best = false, title, price, sub, onPress } = props;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.planCard, selected && styles.planCardSelected]}>
      <View style={styles.radioOuter}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.planTitle}>{title}</Text>
          {best ? (
            <View style={styles.bestTag}>
              <Text style={styles.bestTxt}>Best Value</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.planPrice}>{price}</Text>
        {sub ? <Text style={styles.planSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function PrimaryButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  const { title, onPress, disabled = false } = props;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.cta, disabled && { opacity: 0.65 }]} disabled={disabled}>
      <Text style={styles.ctaTxt}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: subColors.background },
  content: { padding: subSpacing.screen, paddingBottom: 120 },

  header: { marginBottom: 12 },
  kicker: { color: subColors.subText, fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },
  title: { color: subColors.text, fontWeight: '900', fontSize: 28, letterSpacing: -0.6, marginTop: 6 },

  trialCard: {
    backgroundColor: subColors.danger,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    ...subShadow.card,
  },
  trialTxt: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.7, textAlign: 'center' },

  trustRow: { marginTop: 12, marginBottom: 2, alignItems: 'flex-start' },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: subRadius.pill,
    backgroundColor: 'rgba(250,204,21,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.18)',
  },
  trustTxt: { color: subColors.subText, fontWeight: '800', fontSize: 12 },

  sectionTitle: { marginTop: 18, marginBottom: 10, color: subColors.subText, fontWeight: '900', letterSpacing: 1.1, fontSize: 12 },

  featureCard: {
    backgroundColor: subColors.card,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    borderWidth: 1,
    borderColor: subColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...subShadow.card,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(250,204,21,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { color: subColors.text, fontWeight: '900', fontSize: 13 },
  featureSub: { marginTop: 3, color: subColors.subText, fontWeight: '700', fontSize: 12 },

  planCard: {
    backgroundColor: subColors.card,
    borderRadius: subRadius.card,
    padding: subSpacing.card,
    borderWidth: 1,
    borderColor: subColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...subShadow.card,
  },
  planCardSelected: {
    borderColor: 'rgba(250,204,21,0.75)',
    backgroundColor: 'rgba(30,41,59,0.92)',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(250,204,21,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: subColors.accent,
  },
  planTitle: { color: subColors.text, fontWeight: '900', fontSize: 13 },
  planPrice: { marginTop: 6, color: subColors.text, fontWeight: '900', fontSize: 18, letterSpacing: -0.3 },
  planSub: { marginTop: 4, color: subColors.subText, fontWeight: '700', fontSize: 12 },
  bestTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: subRadius.pill,
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.28)',
  },
  bestTxt: { color: subColors.accent, fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },

  cta: {
    marginTop: 18,
    backgroundColor: subColors.accent,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...subShadow.card,
  },
  ctaTxt: { color: '#0B1B2B', fontWeight: '900', fontSize: 13, letterSpacing: 0.9 },
  footer: { marginTop: 10, textAlign: 'center', color: subColors.subText, fontWeight: '700', fontSize: 12 },
});

