import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  buttonText?: string;
  onClose: () => void;
};

export function ErrorModal({
  visible,
  title = 'Something went wrong',
  message,
  icon = 'warning',
  buttonText = 'OK',
  onClose,
}: Props) {
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 95, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, scale]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={30} color={theme.colors.danger} />
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}

          <TouchableOpacity activeOpacity={0.86} style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(mode: 'light' | 'dark') {
  const isDark = mode === 'dark';

  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.62)' },
    card: {
      width: '100%',
      maxWidth: 410,
      alignSelf: 'center',
      alignItems: 'center',
      borderRadius: 20,
      padding: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: isDark ? 0.34 : 0.18,
      shadowRadius: 24,
      elevation: 9,
    },
    iconWrap: {
      width: 58,
      height: 58,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.10)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.20)',
      marginBottom: 14,
    },
    title: {
      fontSize: 20,
      fontWeight: '900',
      color: theme.colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    message: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.mutedText,
      textAlign: 'center',
    },
    button: {
      marginTop: 18,
      width: '100%',
      minHeight: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.danger,
    },
    buttonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  });
}
