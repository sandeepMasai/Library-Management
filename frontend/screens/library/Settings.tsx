import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type PlanKey = 'free_trial' | 'pro_monthly' | 'pro_6_month' | 'pro_yearly';

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toLocaleDateString();
}

export default function LibrarySettingsScreen() {
  const currentUser = useAppStore((s) => s.currentUser);
  const upgradeSubscription = useAppStore((s) => s.upgradeSubscription);
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [busy, setBusy] = useState<PlanKey | null>(null);

  const planInfo = useMemo(() => {
    if (!currentUser) return { plan: '—', expiry: '—' };
    return {
      plan: (currentUser.plan || 'free').toUpperCase(),
      expiry: formatDate(currentUser.planExpiryDate ?? null),
    };
  }, [currentUser]);

  const cards: Array<{
    key: PlanKey;
    title: string;
    priceLine: string;
    cta: string;
    highlight?: boolean;
    sub?: string;
  }> = [
    { key: 'free_trial', title: 'FREE TRIAL', priceLine: '₹0 / 30 Days', cta: 'Start Free' },
    { key: 'pro_monthly', title: 'PRO MONTHLY', priceLine: '₹999 / month', cta: 'Subscribe' },
    { key: 'pro_6_month', title: 'PRO 6 MONTH', priceLine: '₹4999 / 6 months', cta: 'Choose Plan', highlight: true, sub: 'BEST VALUE' },
    { key: 'pro_yearly', title: 'PRO YEARLY', priceLine: '₹10000 / year', cta: 'Choose Plan', sub: 'SAVE MORE' },
  ];

  const onUpgrade = async (key: PlanKey) => {
    Alert.alert('Confirm', 'Upgrade subscription?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          setBusy(key);
          const res = await upgradeSubscription(key);
          setBusy(null);
          if (!res.ok) {
            Alert.alert('Error', res.message || 'Failed');
            return;
          }
          Alert.alert('Done', 'Plan updated.');
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 120 }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>LIBRARY</Text>
          <Text style={styles.title}>Pricing</Text>
        </View>
        <View style={styles.planPill}>
          <Ionicons name="sparkles-outline" size={16} color={theme.colors.mutedText} />
          <Text style={styles.planTxt}>Plan: {planInfo.plan}</Text>
          <Text style={styles.planSub}>Expiry: {planInfo.expiry}</Text>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {cards.map((c) => (
          <View key={c.key} style={[styles.card, c.highlight && styles.cardHighlight]}>
            <View style={styles.cardTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.cardTitle}>[ {c.title} ]</Text>
                {c.sub ? (
                  <View style={[styles.tag, c.highlight && styles.tagHighlight]}>
                    <Text style={[styles.tagTxt, c.highlight && styles.tagTxtHighlight]}>{c.sub}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.price}>{c.priceLine}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.btn, c.highlight && styles.btnHighlight, busy === c.key && { opacity: 0.7 }]}
              onPress={() => onUpgrade(c.key)}
              disabled={busy !== null}
            >
              <Text style={[styles.btnTxt, c.highlight && styles.btnTxtHighlight]}>
                → {busy === c.key ? 'Please wait…' : c.cta}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Limited features on Free</Text>
        <Text style={styles.noteTxt}>
          Pro unlocks full analytics and advanced management features. Payments are not integrated yet — this is a simple upgrade switch for now.
        </Text>
      </View>
    </ScrollView>
  );
}

function makeStyles() {
  return StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3, marginTop: 4 },
  planPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  planTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  planSub: { fontSize: 11, fontWeight: '700', color: theme.colors.mutedText },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    ...theme.shadow.card,
  },
  cardHighlight: { borderColor: 'rgba(13,148,136,0.35)', backgroundColor: 'rgba(13,148,136,0.10)' },
  cardTop: { gap: 8 },
  cardTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 0.9 },
  price: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  tagHighlight: { borderColor: 'rgba(13,148,136,0.35)', backgroundColor: '#CCFBF1' },
  tagTxt: { fontSize: 10, fontWeight: '900', color: theme.colors.mutedText },
  tagTxtHighlight: { color: '#0D9488' },

  btn: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  btnHighlight: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  btnTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  btnTxtHighlight: { color: '#fff' },

  note: { marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  noteTitle: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  noteTxt: { marginTop: 6, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText, lineHeight: 18 },
});
}

