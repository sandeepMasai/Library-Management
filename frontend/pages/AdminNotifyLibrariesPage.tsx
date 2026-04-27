import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPost, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';

type LibraryRow = { id: string; name: string; email: string };

/**
 * AdminNotifyLibrariesPage
 * - Admin-only form to notify libraries.
 * - Backend: POST /api/admin/notify
 * - Target: "all" or libraryId
 */
export default function AdminNotifyLibrariesPage() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'all' | string>('all');
  const [sending, setSending] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [libs, setLibs] = useState<LibraryRow[]>([]);

  const loadLibraries = useCallback(async () => {
    try {
      // Load a reasonable list for picker (first 100)
      const res = await apiGet<{ ok: boolean; libraries: any[] }>(`/api/admin/libraries`, { page: 1, limit: 100 });
      setLibs((res.libraries || []).map((l) => ({ id: l.id, name: l.name, email: l.email })));
    } catch {
      setLibs([]);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    loadLibraries();
  }, [isAuthenticated, role, loadLibraries]);

  const targetLabel = useMemo(() => {
    if (target === 'all') return 'All libraries';
    return libs.find((l) => l.id === target)?.name || 'Selected library';
  }, [target, libs]);

  const onSend = async () => {
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      Alert.alert('Required', 'Please enter title and message.');
      return;
    }
    setSending(true);
    try {
      /**
       * Backend connection:
       * POST /api/admin/notify
       * Body: { title, message, target }
       */
      await apiPost(`/api/admin/notify`, { title: t, message: m, target });
      Alert.alert('Sent', 'Notification sent to libraries.');
      setTitle('');
      setMessage('');
      setTarget('all');
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated()) return <LoginScreen />;
  if (role && role !== 'admin') return <ForbiddenScreen message="This page is only for admin accounts." />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
      <View style={styles.head}>
        <View>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.title}>Notify libraries</Text>
        </View>
        <TouchableOpacity onPress={loadLibraries} style={styles.iconBtn} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.targetBtn} activeOpacity={0.85}>
          <Text style={styles.targetTxt}>Target: {targetLabel}</Text>
          <Ionicons name="chevron-down" size={18} color={theme.colors.mutedText} />
        </TouchableOpacity>

        <Text style={styles.label}>Title</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Enter title" placeholderTextColor="#94A3B8" style={styles.input} />

        <Text style={styles.label}>Message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Enter message"
          placeholderTextColor="#94A3B8"
          style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
          multiline
        />

        <TouchableOpacity onPress={onSend} disabled={sending} style={[styles.primaryBtn, sending && { opacity: 0.7 }]} activeOpacity={0.85}>
          <Text style={styles.primaryTxt}>{sending ? 'Sending…' : 'Send notification'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Choose target</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => {
                setTarget('all');
                setPickerOpen(false);
              }}
            >
              <Text style={styles.rowTitle}>All libraries</Text>
            </TouchableOpacity>

            {libs.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => {
                  setTarget(l.id);
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.rowTitle} numberOfLines={1}>{l.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{l.email}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14, ...theme.shadow.card },
  targetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' },
  targetTxt: { fontWeight: '900', color: theme.colors.text },
  label: { marginTop: 12, fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.9 },
  input: { marginTop: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '700', color: theme.colors.text, backgroundColor: '#fff' },
  primaryBtn: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#0F172A', alignItems: 'center' },
  primaryTxt: { color: '#fff', fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14, ...theme.shadow.card },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  row: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14 },
  rowTitle: { fontWeight: '900', color: theme.colors.text },
  rowSub: { marginTop: 2, fontWeight: '700', color: theme.colors.mutedText, fontSize: 12 },
});

