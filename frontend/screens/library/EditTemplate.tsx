import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiDelete, apiGet, apiPut, type ApiError } from '../../services/api';
import { replaceVariables } from '../../utils/templates';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type TemplateRow = {
  id: string;
  name: string;
  message: string;
  isSystem: boolean;
  locked: boolean;
};

export default function EditTemplateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const templateId = String(route.params?.templateId || '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; templates: TemplateRow[] }>(`/api/templates`);
      const found = (res.templates || []).find((t) => t.id === templateId);
      if (!found) throw { message: 'Template not found' };
      setTpl(found);
      setName(found.name);
      setMessage(found.message);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const locked = Boolean(tpl?.locked || tpl?.isSystem);

  const preview = useMemo(() => {
    return replaceVariables(message, {
      student_name: 'Amit',
      amount: 500,
      due_date: '2026-05-01',
      library_name: 'TrackMyLibrary',
    });
  }, [message]);

  const onSave = async () => {
    if (locked) return;
    if (!name.trim() || !message.trim()) {
      Alert.alert('Required', 'Template name and message are required.');
      return;
    }
    setSaving(true);
    try {
      await apiPut(`/api/templates/${templateId}`, { name: name.trim(), message: message.trim() });
      Alert.alert('Saved', 'Template updated.');
      navigation.goBack();
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (locked) return;
    Alert.alert('Delete template', 'Delete this custom template?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDelete(`/api/templates/${templateId}`);
            Alert.alert('Deleted', 'Template removed.');
            navigation.goBack();
          } catch (e: any) {
            const err = e as ApiError;
            Alert.alert('Error', err?.message || 'Failed to delete template');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Edit Template</Text>
        <View style={{ width: 40 }} />
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
        <>
          {locked ? (
            <View style={styles.infoBox}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.colors.mutedText} />
              <Text style={styles.infoTxt}>System templates are locked.</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>TEMPLATE NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            editable={!locked}
            placeholder="Template name"
            placeholderTextColor={theme.colors.mutedText}
            style={[styles.input, locked && styles.inputLocked]}
          />

          <Text style={styles.sectionTitle}>MESSAGE CONTENT</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            editable={!locked}
            placeholder="Write message…"
            placeholderTextColor={theme.colors.mutedText}
            style={[styles.input, styles.textarea, locked && styles.inputLocked]}
            multiline
          />

          <View style={styles.help}>
            <Text style={styles.helpTitle}>Variables</Text>
            <Text style={styles.helpTxt}>{'{student_name}  {amount}  {due_date}  {library_name}'}</Text>
          </View>

          <Text style={styles.sectionTitle}>PREVIEW</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewTxt}>{preview}</Text>
          </View>

          {!locked ? (
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} activeOpacity={0.9} onPress={onSave} disabled={saving}>
              <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save Template'}</Text>
            </TouchableOpacity>
          ) : null}

          {!locked ? (
            <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.9} onPress={onDelete} disabled={saving}>
              <Text style={styles.deleteTxt}>Delete Template</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function makeStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 140 },
  center: { paddingVertical: 30, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: theme.colors.mutedText, fontWeight: '800', textAlign: 'center' },
  err: { color: theme.colors.danger, fontWeight: '900' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
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

  sectionTitle: { marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  textarea: { height: 120, textAlignVertical: 'top' },
  inputLocked: { opacity: 0.7 },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(100,116,139,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.18)',
  },
  infoTxt: { color: theme.colors.mutedText, fontWeight: '800' },

  help: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  helpTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
  helpTxt: { marginTop: 6, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },

  previewBox: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  previewTxt: { color: theme.colors.text, fontWeight: '700', lineHeight: 18 },

  saveBtn: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveTxt: { color: '#fff', fontWeight: '900' },

  deleteBtn: {
    marginTop: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteTxt: { color: '#DC2626', fontWeight: '900' },
});
}

