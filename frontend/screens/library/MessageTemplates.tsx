import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiGet, type ApiError } from '../../services/api';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type TemplateRow = {
  id: string;
  name: string;
  message: string;
  type: 'system' | 'custom';
  isSystem: boolean;
  locked: boolean;
};

/**
 * MessageTemplatesScreen
 *
 * Lists system + custom templates (library-scoped).
 */
export default function MessageTemplatesScreen() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; templates: TemplateRow[] }>(`/api/templates`);
      setTemplates(res.templates || []);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const subtitle = useMemo(() => 'Create and manage WhatsApp message templates for reminders and updates.', []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Message Templates</Text>
        <TouchableOpacity onPress={load} style={styles.backBtn} activeOpacity={0.85} accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Manage Templates</Text>
        <Text style={styles.subTitle}>{subtitle}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>Could not load</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              title={t.name}
              preview={t.message}
              isSystem={t.isSystem}
              onPress={() => navigation.navigate('EditTemplate', { templateId: t.id })}
            />
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.addBtn}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('CreateTemplate')}
      >
        <Text style={styles.addTxt}>+ Add Custom Template</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TemplateCard(props: {
  title: string;
  preview: string;
  isSystem: boolean;
  onPress: () => void;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const { title, preview, isSystem, onPress } = props;
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0D9488" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {isSystem ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>SYSTEM</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
    </TouchableOpacity>
  );
}

function makeStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 140 },
  center: { paddingVertical: 30, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: theme.colors.mutedText, fontWeight: '800', textAlign: 'center' },
  err: { color: theme.colors.danger, fontWeight: '900' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 30 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text },

  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3 },
  subTitle: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.colors.mutedText, lineHeight: 18 },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...theme.shadow.card,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(13,148,136,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  preview: { marginTop: 5, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(100,116,139,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.25)',
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 0.6 },

  addBtn: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTxt: { color: '#fff', fontWeight: '900', letterSpacing: 0.3 },
});
}

