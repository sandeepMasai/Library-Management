import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { settingsRadius, settingsShadow, settingsSpacing } from '../../ui/settingsTheme';

/**
 * ProBanner (reusable)
 *
 * Gradient banner:
 * - Left: title + subtitle
 * - Right: VIEW button
 *
 * Pass expiryDays to show "Renews in X days".
 */
export default function ProBanner(props: { expiryDays: number; onPress?: () => void }) {
  const { expiryDays, onPress } = props;
  const days = Math.max(0, Math.floor(Number(expiryDays || 0)));

  return (
    <LinearGradient colors={['#16A34A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      {/* Left icon */}
      <View style={styles.iconWrap}>
        <Ionicons name="sparkles" size={18} color="#fff" />
      </View>

      {/* Center text */}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.title}>You are PRO</Text>
        <Text style={styles.sub}>Renews in {days} days</Text>
      </View>

      {/* Right button */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.btn}>
        <Text style={styles.btnTxt}>VIEW</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: settingsRadius.card,
    padding: settingsSpacing.card,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...settingsShadow.card,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '900', color: '#fff' },
  sub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)' },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnTxt: { color: '#0F172A', fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
});

