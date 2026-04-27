import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiPost, type ApiError } from '../../services/api';
import { replaceVariables } from '../../utils/templates';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

export default function CreateTemplateScreen() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const preview = replaceVariables(message, {
    student_name: 'Amit',
    amount: 500,
    due_date: '2026-05-01',
    library_name: 'TrackMyLibrary',
  });

  const onSave = async () => {
    if (!name.trim() || !message.trim()) {
      Alert.alert('Required', 'Template name and message are required.');
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/api/templates`, { name: name.trim(), message: message.trim() });
      Alert.alert('Saved', 'Template created.');
      navigation.goBack();
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Create Template</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.sectionTitle}>TEMPLATE NAME</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Template name"
        placeholderTextColor={theme.colors.mutedText}
        style={styles.input}
      />

      <Text style={styles.sectionTitle}>MESSAGE CONTENT</Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Write message…"
        placeholderTextColor={theme.colors.mutedText}
        style={[styles.input, styles.textarea]}
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

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} activeOpacity={0.9} onPress={onSave} disabled={saving}>
        <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save Template'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 140 },

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

  help: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  helpTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
  helpTxt: { marginTop: 6, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },

  previewBox: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  previewTxt: { color: theme.colors.text, fontWeight: '700', lineHeight: 18 },

  saveBtn: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveTxt: { color: '#fff', fontWeight: '900' },
});
}

