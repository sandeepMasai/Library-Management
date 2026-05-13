import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

export type ConfirmTone = 'neutral' | 'danger' | 'primary';

type Props = {
  visible: boolean;
  tone?: ConfirmTone;
  label?: string;
  title: string;
  description?: string;
  loading?: boolean;
  errorText?: string | null;
  showCancel?: boolean;
  cancelText?: string;
  confirmText?: string;
  confirmIcon?: keyof typeof Ionicons.glyphMap;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  visible,
  tone = 'neutral',
  label,
  title,
  description,
  loading = false,
  errorText,
  showCancel = true,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  confirmIcon,
  onCancel,
  onConfirm,
}: Props) {
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode, tone), [mode, tone]);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, scale]);

  const icon =
    confirmIcon ??
    (tone === 'danger' ? 'trash-outline' : tone === 'primary' ? 'checkmark-circle-outline' : 'log-out-outline');

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onCancel} />

        <Animated.View style={[styles.cardWrap, { opacity, transform: [{ scale }] }]}>
          <LinearGradient colors={['#0B1220', '#111827']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            {!!label && (
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Ionicons name={tone === 'danger' ? 'warning' : 'information-circle'} size={12} color={stylesVars(tone).accent} />
                  <Text style={styles.badgeTxt}>{label}</Text>
                </View>
              </View>
            )}

            <Text style={styles.title}>{title}</Text>
            {!!description && <Text style={styles.desc}>{description}</Text>}
            {!!errorText && <Text style={styles.error}>{errorText}</Text>}

            <View style={styles.btnRow}>
              {showCancel && (
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={onCancel}
                  disabled={loading}
                  style={[styles.btn, styles.btnCancel, loading && styles.btnDisabled]}
                >
                  <Text style={styles.btnCancelTxt}>{cancelText}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.86}
                onPress={onConfirm}
                disabled={loading}
                style={[styles.btn, styles.btnConfirm, !showCancel && styles.btnSolo, loading && styles.btnDisabled]}
              >
                <Ionicons name={loading ? 'time-outline' : icon} size={16} color="#fff" />
                <Text style={styles.btnConfirmTxt}>{loading ? 'Please wait…' : confirmText}</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

function stylesVars(tone: ConfirmTone) {
  if (tone === 'danger') return { accent: theme.colors.danger, solid: '#EF4444' };
  if (tone === 'primary') return { accent: theme.colors.primary, solid: '#0EA5E9' };
  return { accent: '#E5E7EB', solid: '#334155' };
}

function makeStyles(mode: 'light' | 'dark', tone: ConfirmTone) {
  const isDark = mode === 'dark';
  const v = stylesVars(tone);
  const badgeBg = tone === 'danger' ? 'rgba(239,68,68,0.14)' : 'rgba(148,163,184,0.16)';
  const badgeBorder = tone === 'danger' ? 'rgba(239,68,68,0.30)' : 'rgba(148,163,184,0.28)';

  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', paddingHorizontal: 18 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    cardWrap: { alignSelf: 'center', width: '100%', maxWidth: 420 },
    card: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
    badgeRow: { flexDirection: 'row', marginBottom: 10 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: badgeBg,
      borderWidth: 1,
      borderColor: badgeBorder,
    },
    badgeTxt: { color: tone === 'danger' ? '#FCA5A5' : '#E5E7EB', fontWeight: '900', fontSize: 10, letterSpacing: 0.8 },
    title: { marginTop: 2, fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
    desc: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: isDark ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.78)',
    },
    error: { marginTop: 10, fontSize: 12, fontWeight: '800', color: '#FCA5A5' },
    btnRow: { marginTop: 16, flexDirection: 'row', gap: 10 },
    btn: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    btnCancel: {
      backgroundColor: 'rgba(148,163,184,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(148,163,184,0.30)',
    },
    btnCancelTxt: { color: '#E5E7EB', fontWeight: '900' },
    btnConfirm: {
      backgroundColor: v.solid,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    btnConfirmTxt: { color: '#fff', fontWeight: '900' },
    btnSolo: { flex: 1 },
    btnDisabled: { opacity: 0.72 },
  });
}

