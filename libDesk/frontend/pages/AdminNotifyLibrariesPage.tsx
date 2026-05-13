import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiDelete, apiGet, apiPost, apiPut, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';
import { ConfirmModal, type ConfirmTone } from '../components/ConfirmModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';

type LibraryRow = { id: string; name: string; email: string };

type AdminNotificationRow = {
  id: string;
  title: string;
  message: string;
  target: 'all' | string | null;
  createdAt: string | null;
  count?: number;
};

function withAlpha(hex: string, alpha: number) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * AdminNotifyLibrariesPage
 * - Admin-only form to notify libraries.
 * - Backend: POST /api/admin/notify
 * - Target: "all" or libraryId
 */
export default function AdminNotifyLibrariesPage() {
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.role);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'all' | string>('all');
  const [sending, setSending] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [libs, setLibs] = useState<LibraryRow[]>([]);
  const [titleFocus, setTitleFocus] = useState(false);
  const [msgFocus, setMsgFocus] = useState(false);
  const pressScale = useMemo(() => new Animated.Value(1), []);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recent, setRecent] = useState<AdminNotificationRow[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editTitleFocus, setEditTitleFocus] = useState(false);
  const [editMsgFocus, setEditMsgFocus] = useState(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    tone: ConfirmTone;
    label: string;
    title: string;
    description?: string;
    showCancel?: boolean;
    cancelText?: string;
    confirmText?: string;
    confirmIcon?: keyof typeof Ionicons.glyphMap;
    loading?: boolean;
    onConfirm?: () => void;
  }>({
    visible: false,
    tone: 'neutral',
    label: 'INFO',
    title: '',
  });

  const loadLibraries = useCallback(async () => {
    try {
      // Load a reasonable list for picker (first 100)
      const res = await apiGet<{ ok: boolean; libraries: any[] }>(`/api/admin/libraries`, { page: 1, limit: 100 });
      setLibs((res.libraries || []).map((l) => ({ id: l.id, name: l.name, email: l.email })));
    } catch {
      setLibs([]);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(null);
    try {
      const res = await apiGet<{ ok: boolean; notifications?: any[] }>(`/api/admin/notifications`);
      const rows = Array.isArray(res?.notifications) ? res.notifications : [];
      const mapped: AdminNotificationRow[] = rows
        .map((n: any) => ({
          id: String(n?.id ?? n?._id ?? `${n?.createdAt ?? ''}-${n?.title ?? ''}`),
          title: String(n?.title ?? ''),
          message: String(n?.message ?? ''),
          target: (n?.target ?? null) as any,
          createdAt: n?.createdAt ? String(n.createdAt) : (n?.date ? String(n.date) : null),
          count: typeof n?.count === 'number' ? Number(n.count) : undefined,
        }))
        .filter((n) => n.title || n.message);
      setRecent(mapped);
    } catch (e: any) {
      const err = e as ApiError;
      setRecentError(err?.message || 'Failed to load notifications');
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (role && role !== 'admin') return;
    loadLibraries();
    loadRecent();
  }, [isAuthenticated, role, loadLibraries]);

  const targetLabel = useMemo(() => {
    if (target === 'all') return 'All libraries';
    return libs.find((l) => l.id === target)?.name || 'Selected library';
  }, [target, libs]);

  const onSend = async () => {
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      setModal({
        visible: true,
        tone: 'neutral',
        label: 'REQUIRED',
        title: 'Missing details',
        description: 'Please enter title and message.',
        showCancel: false,
        confirmText: 'OK',
        confirmIcon: 'checkmark-outline',
      });
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
      setModal({
        visible: true,
        tone: 'primary',
        label: 'SENT',
        title: 'Notification sent',
        description: 'Notification sent to libraries.',
        showCancel: false,
        confirmText: 'OK',
        confirmIcon: 'checkmark-circle-outline',
      });
      setTitle('');
      setMessage('');
      setTarget('all');
      // Refresh recent list after successful send (UI-only integration)
      loadRecent();
    } catch (e: any) {
      const err = e as ApiError;
      setModal({
        visible: true,
        tone: 'danger',
        label: 'ERROR',
        title: 'Could not send',
        description: err?.message || 'Failed to send',
        showCancel: false,
        confirmText: 'OK',
        confirmIcon: 'close-outline',
      });
    } finally {
      setSending(false);
    }
  };

  const openEdit = useCallback((row: AdminNotificationRow) => {
    setEditingId(row.id);
    setEditTitle(String(row.title || '').trim());
    setEditMessage(String(row.message || '').trim());
    setEditOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    if (editSaving) return;
    setEditOpen(false);
    setEditingId(null);
    setEditTitle('');
    setEditMessage('');
    setEditTitleFocus(false);
    setEditMsgFocus(false);
  }, [editSaving]);

  const onSaveEdit = useCallback(async () => {
    if (editSaving) return;
    const id = String(editingId || '').trim();
    const t = editTitle.trim();
    const m = editMessage.trim();
    if (!id) return;
    if (!t || !m) {
      setModal({
        visible: true,
        tone: 'neutral',
        label: 'REQUIRED',
        title: 'Missing details',
        description: 'Please enter title and message.',
        showCancel: false,
        confirmText: 'OK',
        confirmIcon: 'checkmark-outline',
      });
      return;
    }
    setEditSaving(true);
    try {
      await apiPut(`/api/admin/notifications/${id}`, { title: t, message: m });
      setEditOpen(false);
      setEditingId(null);
      await loadRecent();
    } catch (e: any) {
      const err = e as ApiError;
      setModal({
        visible: true,
        tone: 'danger',
        label: 'ERROR',
        title: 'Update failed',
        description: err?.message || 'Failed to update',
        showCancel: false,
        confirmText: 'OK',
        confirmIcon: 'close-outline',
      });
    } finally {
      setEditSaving(false);
    }
  }, [editSaving, editingId, editTitle, editMessage, loadRecent]);

  const onDelete = useCallback(
    (row: AdminNotificationRow) => {
      const id = String(row.id || '').trim();
      if (!id) return;
      setModal({
        visible: true,
        tone: 'danger',
        label: 'DELETE',
        title: 'Delete notification?',
        description: 'This will remove the notification from libraries.',
        showCancel: true,
        cancelText: 'Cancel',
        confirmText: 'Delete',
        confirmIcon: 'trash-outline',
        onConfirm: async () => {
          try {
            setModal((s) => ({ ...s, loading: true }));
            await apiDelete(`/api/admin/notifications/${id}`);
            await loadRecent();
            setModal({
              visible: true,
              tone: 'primary',
              label: 'DELETED',
              title: 'Notification deleted',
              description: 'The notification was removed successfully.',
              showCancel: false,
              confirmText: 'OK',
              confirmIcon: 'checkmark-circle-outline',
            });
          } catch (e: any) {
            const err = e as ApiError;
            setModal({
              visible: true,
              tone: 'danger',
              label: 'ERROR',
              title: 'Delete failed',
              description: err?.message || 'Failed to delete',
              showCancel: false,
              confirmText: 'OK',
              confirmIcon: 'close-outline',
            });
          }
        },
      });
    },
    [loadRecent]
  );

  if (!isAuthenticated()) return <LoginScreen />;
  if (role && role !== 'admin') return <ForbiddenScreen message="This page is only for admin accounts." />;

  const placeholder = theme.colors.mutedText;
  const fieldBorder = theme.colors.border;
  const fieldBorderFocus = theme.colors.primary;
  const modalBackdrop = withAlpha(theme.colors.dark, 0.62);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>SUPER ADMIN</Text>
          <Text style={styles.title}>Notify libraries</Text>
          <Text style={styles.subTitle} numberOfLines={2}>
            Send an announcement to all libraries or a specific library.
          </Text>
        </View>
        <TouchableOpacity onPress={loadLibraries} style={styles.iconBtn} activeOpacity={0.85} accessibilityRole="button">
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Target</Text>
        <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.targetBtn} activeOpacity={0.9} accessibilityRole="button">
          <View style={styles.targetLeft}>
            <View style={styles.targetIcon}>
              <Ionicons name="paper-plane-outline" size={16} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.targetTitle} numberOfLines={1}>{targetLabel}</Text>
              <Text style={styles.targetSub} numberOfLines={1}>
                {target === 'all' ? 'Broadcast' : 'Single library'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-down" size={18} color={theme.colors.mutedText} />
        </TouchableOpacity>

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Enter title"
          placeholderTextColor={placeholder}
          style={[styles.input, { borderColor: titleFocus ? fieldBorderFocus : fieldBorder }]}
          onFocus={() => setTitleFocus(true)}
          onBlur={() => setTitleFocus(false)}
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Enter message"
          placeholderTextColor={placeholder}
          style={[
            styles.input,
            styles.textArea,
            { borderColor: msgFocus ? fieldBorderFocus : fieldBorder },
          ]}
          onFocus={() => setMsgFocus(true)}
          onBlur={() => setMsgFocus(false)}
          multiline
        />

        <Pressable
          onPress={onSend}
          disabled={sending}
          onPressIn={() => {
            Animated.spring(pressScale, { toValue: 0.98, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
          }}
          onPressOut={() => {
            Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
          }}
          style={[styles.primaryWrap, sending && { opacity: 0.72 }]}
          accessibilityRole="button"
        >
          <Animated.View style={{ transform: [{ scale: pressScale }] }}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtn}>
              <Ionicons name="send-outline" size={16} color={theme.colors.surface} />
              <Text style={styles.primaryTxt}>{sending ? 'Sending…' : 'Send notification'}</Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>

      {/* Recent notifications */}
      <View style={styles.recentHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.recentTitle}>Recently sent</Text>
          <Text style={styles.recentSub} numberOfLines={1}>
            Latest notifications sent from Super Admin
          </Text>
        </View>
        <TouchableOpacity
          onPress={loadRecent}
          style={[styles.iconBtn, { width: 40, height: 40, borderRadius: 14 }]}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.recentCard}>
        {recentLoading ? (
          <Text style={styles.recentMuted}>Loading…</Text>
        ) : recentError ? (
          <Text style={[styles.recentMuted, { color: theme.colors.danger }]}>{recentError}</Text>
        ) : recent.length === 0 ? (
          <Text style={styles.recentMuted}>No notifications yet.</Text>
        ) : (
          recent.map((n) => {
            const isAll = n.target === 'all' || !n.target;
            const libName = !isAll ? (libs.find((l) => l.id === n.target)?.name || 'Selected library') : 'All libraries';
            const when = (() => {
              if (!n.createdAt) return '—';
              const d = new Date(n.createdAt);
              if (Number.isNaN(d.getTime())) return '—';
              return d.toLocaleString();
            })();
            return (
              <View key={n.id} style={styles.recentRow}>
                <View style={styles.recentRowTop}>
                  <View style={styles.recentBadge}>
                    <Ionicons name={isAll ? 'globe-outline' : 'business-outline'} size={14} color={theme.colors.primary} />
                    <Text style={styles.recentBadgeTxt} numberOfLines={1}>{libName}</Text>
                  </View>
                  <View style={styles.recentTopRight}>
                    <Text style={styles.recentDate} numberOfLines={1}>{when}</Text>
                    <View style={styles.recentActions}>
                      <TouchableOpacity
                        onPress={() => openEdit(n)}
                        style={styles.actionBtn}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={16} color={theme.colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onDelete(n)}
                        style={[styles.actionBtn, styles.actionBtnDanger]}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <Text style={styles.recentRowTitle} numberOfLines={1}>{n.title || '—'}</Text>
                <Text style={styles.recentRowMsg} numberOfLines={3}>{n.message || '—'}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Edit modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={[styles.modalBackdrop, { backgroundColor: modalBackdrop }]}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>Edit notification</Text>
                <Text style={styles.modalSub} numberOfLines={1}>Update title and message</Text>
              </View>
              <TouchableOpacity onPress={closeEdit} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Enter title"
              placeholderTextColor={placeholder}
              style={[styles.input, { borderColor: editTitleFocus ? fieldBorderFocus : fieldBorder }]}
              onFocus={() => setEditTitleFocus(true)}
              onBlur={() => setEditTitleFocus(false)}
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              value={editMessage}
              onChangeText={setEditMessage}
              placeholder="Enter message"
              placeholderTextColor={placeholder}
              style={[
                styles.input,
                styles.textArea,
                { borderColor: editMsgFocus ? fieldBorderFocus : fieldBorder },
              ]}
              onFocus={() => setEditMsgFocus(true)}
              onBlur={() => setEditMsgFocus(false)}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closeEdit} activeOpacity={0.85} style={styles.modalBtnSecondary} accessibilityRole="button">
                <Text style={styles.modalBtnSecondaryTxt}>Cancel</Text>
              </TouchableOpacity>
              <Pressable
                onPress={onSaveEdit}
                disabled={editSaving}
                style={[styles.modalBtnPrimaryWrap, editSaving && { opacity: 0.72 }]}
                accessibilityRole="button"
              >
                <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalBtnPrimary}>
                  <Ionicons name="save-outline" size={16} color={theme.colors.surface} />
                  <Text style={styles.modalBtnPrimaryTxt}>{editSaving ? 'Saving…' : 'Save'}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: modalBackdrop }]}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>Choose target</Text>
                <Text style={styles.modalSub} numberOfLines={1}>Select “All libraries” or pick one library</Text>
              </View>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.row, target === 'all' && styles.rowSelected]}
                activeOpacity={0.9}
                onPress={() => {
                  setTarget('all');
                  setPickerOpen(false);
                }}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="globe-outline" size={16} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle}>All libraries</Text>
                    <Text style={styles.rowSub}>Broadcast</Text>
                  </View>
                </View>
                {target === 'all' ? <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} /> : null}
              </TouchableOpacity>

              <View style={styles.divider} />

              {libs.map((l) => {
                const selected = target === l.id;
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.row, selected && styles.rowSelected]}
                    activeOpacity={0.9}
                    onPress={() => {
                      setTarget(l.id);
                      setPickerOpen(false);
                    }}
                  >
                    <View style={styles.rowLeft}>
                      <View style={styles.rowIcon}>
                        <Ionicons name="business-outline" size={16} color={theme.colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{l.name}</Text>
                        <Text style={styles.rowSub} numberOfLines={1}>{l.email}</Text>
                      </View>
                    </View>
                    {selected ? <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={modal.visible}
        tone={modal.tone}
        label={modal.label}
        title={modal.title}
        description={modal.description}
        loading={Boolean(modal.loading)}
        showCancel={modal.showCancel ?? false}
        cancelText={modal.cancelText}
        confirmText={modal.confirmText ?? 'OK'}
        confirmIcon={modal.confirmIcon}
        onCancel={() => {
          if (modal.loading) return;
          setModal((s) => ({ ...s, visible: false, loading: false, onConfirm: undefined }));
        }}
        onConfirm={async () => {
          if (modal.loading) return;
          const fn = modal.onConfirm;
          if (typeof fn === 'function') {
            await fn();
            return;
          }
          setModal((s) => ({ ...s, visible: false, loading: false, onConfirm: undefined }));
        }}
      />
    </ScrollView>
  );
}

function makeStyles(_mode: 'light' | 'dark') {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },

    head: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
    title: { fontSize: 23, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
    subTitle: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.colors.mutedText, lineHeight: 18 },

    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      ...theme.shadow.card,
    },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      ...theme.shadow.card,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.colors.mutedText,
      textTransform: 'uppercase',
      letterSpacing: 0.9,
      marginBottom: 8,
    },

    targetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    targetLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    targetIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    targetTitle: { fontWeight: '900', color: theme.colors.text, fontSize: 14 },
    targetSub: { marginTop: 2, fontWeight: '700', color: theme.colors.mutedText, fontSize: 12 },

    label: {
      marginTop: 14,
      fontSize: 12,
      fontWeight: '900',
      color: theme.colors.mutedText,
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    input: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
    },
    textArea: { height: 132, textAlignVertical: 'top' as any },

    primaryWrap: { marginTop: 16, borderRadius: 16 },
    primaryBtn: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    primaryTxt: { color: theme.colors.surface, fontWeight: '900', fontSize: 14, textAlign: 'center' },

    modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
    modalCard: {
      width: '100%',
      maxWidth: 560,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      ...theme.shadow.card,
    },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
    modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
    modalSub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: 10 },

    row: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    rowSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { fontWeight: '900', color: theme.colors.text },
    rowSub: { marginTop: 2, fontWeight: '700', color: theme.colors.mutedText, fontSize: 12 },

    recentHead: {
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    recentTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
    recentSub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

    recentCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      ...theme.shadow.card,
    },
    recentMuted: { color: theme.colors.mutedText, fontWeight: '800' },
    recentRow: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      padding: 14,
      marginBottom: 12,
    },
    recentRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
    recentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flex: 1,
      minWidth: 0,
    },
    recentBadgeTxt: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '900', color: theme.colors.text },
    recentTopRight: { alignItems: 'flex-end', gap: 8 },
    recentDate: { fontSize: 11, fontWeight: '800', color: theme.colors.mutedText, maxWidth: 140, textAlign: 'right' },
    recentActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBtnDanger: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    recentRowTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginBottom: 6 },
    recentRowMsg: { fontSize: 13, fontWeight: '700', color: theme.colors.mutedText, lineHeight: 18 },

    modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    modalBtnSecondary: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalBtnSecondaryTxt: { color: theme.colors.text, fontWeight: '900' },
    modalBtnPrimaryWrap: { flex: 1, borderRadius: 16 },
    modalBtnPrimary: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    modalBtnPrimaryTxt: { color: theme.colors.surface, fontWeight: '900' },
  });
}

