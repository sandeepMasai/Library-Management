import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { theme } from '../../theme';

type Option = {
  key: 'light' | 'dark' | 'system';
  title: string;
  subtitle: string;
  icon: any;
  preview: { bg: string; card: string; text: string; border: string };
};

export default function AppearanceScreen() {
  const { preference, setMode, mode } = useTheme();

  const options: Option[] = React.useMemo(
    () => [
      {
        key: 'light',
        title: 'Light',
        subtitle: 'Always use light theme',
        icon: 'sunny-outline',
        preview: { bg: '#F6F8FB', card: '#FFFFFF', text: '#0F172A', border: '#E6EAF0' },
      },
      {
        key: 'dark',
        title: 'Dark',
        subtitle: 'Always use dark theme',
        icon: 'moon-outline',
        preview: { bg: '#0B1B2B', card: '#111827', text: '#FFFFFF', border: 'rgba(255,255,255,0.12)' },
      },
      {
        key: 'system',
        title: 'System',
        subtitle: 'Match your device setting',
        icon: 'contrast-outline',
        preview: { bg: '#0F172A', card: '#1F2937', text: '#FFFFFF', border: 'rgba(255,255,255,0.12)' },
      },
    ],
    []
  );

  const styles = React.useMemo(() => makeStyles(), [mode, preference]);

  const onPick = async (key: Option['key']) => {
    await setMode(key);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Appearance</Text>
        <Text style={styles.subtitle}>Choose how TrackMyLibrary looks on this device</Text>
      </View>

      <View style={styles.card}>
        {options.map((opt, idx) => {
          const selected = preference === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.85}
              onPress={() => onPick(opt.key)}
              style={[styles.row, idx !== 0 && styles.rowTopBorder]}
              accessibilityRole="button"
              accessibilityLabel={`Select ${opt.title} theme`}
            >
              <View style={styles.left}>
                <View style={styles.iconWrap}>
                  <Ionicons name={opt.icon} size={18} color={theme.colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{opt.title}</Text>
                  <Text style={styles.rowSub}>{opt.subtitle}</Text>
                </View>
              </View>

              <View style={styles.right}>
                <View
                  style={[
                    styles.preview,
                    { backgroundColor: opt.preview.bg, borderColor: opt.preview.border },
                  ]}
                >
                  <View style={[styles.previewCard, { backgroundColor: opt.preview.card }]} />
                  <View style={[styles.previewLine, { backgroundColor: opt.preview.text, opacity: 0.8 }]} />
                </View>
                <View style={[styles.check, selected && styles.checkOn]}>
                  {selected ? <Ionicons name="checkmark" size={14} color={theme.colors.surface} /> : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.foot}>
        Tip: “System” will automatically switch when you change your phone’s appearance setting.
      </Text>
    </ScrollView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 24 },

    header: { marginBottom: 14 },
    title: { fontSize: 26, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
    subtitle: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.colors.mutedText, lineHeight: 18 },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      ...theme.shadow.card,
    },

    row: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowTopBorder: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },

    left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: Platform.OS === 'android' ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.10)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(37,99,235,0.18)',
    },
    rowTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
    rowSub: { marginTop: 3, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

    right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    preview: {
      width: 44,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      padding: 6,
      justifyContent: 'space-between',
    },
    previewCard: { height: 10, borderRadius: 6, opacity: 0.95 },
    previewLine: { height: 4, borderRadius: 4 },

    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    checkOn: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    foot: {
      marginTop: 12,
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.mutedText,
      lineHeight: 16,
    },
  });
}

