import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiDelete, apiGet, apiPost, apiPut, type ApiError } from '../services/api';
import { useAppStore } from '../store';
import { theme } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ForbiddenScreen from '../screens/common/ForbiddenScreen';
import { useTheme } from '../theme/ThemeProvider';

type PlanRow = {
  _id: string;
  name: string;
  key: 'trial' | 'monthly' | '6month' | 'yearly' | string;
  price: number;
  discount: number;
  finalPrice: number;
  duration: number;
  isActive: boolean;
  tag?: string | null;
};

function calcFinal(price: number, discountPct: number) {
  const p = Number(price || 0);
  const d = Math.min(100, Math.max(0, Number(discountPct || 0)));
  const final = Math.round((p - p * (d / 100)) * 100) / 100;
  return Math.max(0, final);
}

export default function AdminPlansPage() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated());
  const role = useAppStore((s) => s.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PlanRow[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanRow | null>(null);

  const [fName, setFName] = useState('');
  const [fKey, setFKey] = useState('');
  const [fPrice, setFPrice] = useState('0');
  const [fDiscount, setFDiscount] = useState('0');
  const [fDuration, setFDuration] = useState('0');
  const [fTag, setFTag] = useState('');
  const [fActive, setFActive] = useState(true);

  const finalPreview = useMemo(() => calcFinal(Number(fPrice), Number(fDiscount)), [fPrice, fDiscount]);

  const resetForm = useCallback(() => {
    setEditing(null);
    setFName('');
    setFKey('');
    setFPrice('0');
    setFDiscount('0');
    setFDuration('0');
    setFTag('');
    setFActive(true);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((p: PlanRow) => {
    setEditing(p);
    setFName(p.name || '');
    setFKey(String(p.key || ''));
    setFPrice(String(p.price ?? 0));
    setFDiscount(String(p.discount ?? 0));
    setFDuration(String(p.duration ?? 0));
    setFTag(String(p.tag || ''));
    setFActive(Boolean(p.isActive));
    setOpen(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; plans: PlanRow[] }>(`/api/plans`, { all: 1 });
      setRows(Array.isArray(res?.plans) ? res.plans : []);
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (role !== 'admin') return;
    load();
  }, [isAuthenticated, role, load]);

  const save = useCallback(async () => {
    const name = fName.trim();
    const key = fKey.trim().toLowerCase();
    const priceRaw = fPrice.trim();
    const discountRaw = fDiscount.trim();
    const durationRaw = fDuration.trim();
    const price = Number(priceRaw);
    const discount = Number(discountRaw);
    const duration = Number(durationRaw);
    const tag = fTag.trim() ? fTag.trim() : null;

    if (!name) return Alert.alert('Missing', 'Plan name is required');
    if (!key) return Alert.alert('Missing', 'Plan key is required');
    if (!priceRaw || Number.isNaN(price) || !Number.isFinite(price) || price < 0) {
      return Alert.alert('Invalid', 'Enter valid price');
    }
    if (!discountRaw || Number.isNaN(discount) || !Number.isFinite(discount) || discount < 0 || discount > 100) {
      return Alert.alert('Invalid', 'Enter valid discount (0–100)');
    }
    if (!durationRaw || Number.isNaN(duration) || !Number.isFinite(duration) || duration < 0) {
      return Alert.alert('Invalid', 'Enter valid duration in days');
    }

    setSaving(true);
    try {
      if (editing?._id) {
        await apiPut(`/api/plans/${editing._id}`, { name, key, price, discount, duration, isActive: fActive, tag });
      } else {
        await apiPost(`/api/plans`, { name, key, price, discount, duration, isActive: fActive, tag });
      }
      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Save failed', err?.message || 'Could not save plan');
    } finally {
      setSaving(false);
    }
  }, [editing, fActive, fDiscount, fDuration, fKey, fName, fPrice, fTag, load, resetForm]);

  const toggleActive = useCallback(
    async (p: PlanRow) => {
      try {
        await apiPut(`/api/plans/${p._id}`, { isActive: !p.isActive });
        setRows((prev) => prev.map((x) => (x._id === p._id ? { ...x, isActive: !p.isActive } : x)));
      } catch (e: any) {
        const err = e as ApiError;
        Alert.alert('Update failed', err?.message || 'Could not update plan');
      }
    },
    [setRows]
  );

  const remove = useCallback((p: PlanRow) => {
    const key = String(p?.key || '').toLowerCase();
    if (key === 'trial') {
      Alert.alert('Protected plan', 'The Trial plan cannot be deleted.');
      return;
    }
    if (deletingId) return;
    Alert.alert('Delete plan?', `${p.name} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeletingId(p._id);
            await apiDelete(`/api/plans/${p._id}`);
            setRows((prev) => prev.filter((x) => x._id !== p._id));
          } catch (e: any) {
            const err = e as ApiError;
            Alert.alert('Delete failed', err?.message || 'Could not delete plan');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }, [deletingId]);

  if (!isAuthenticated) return <LoginScreen />;
  if (role && role !== 'admin') return <ForbiddenScreen message="This page is only for admin accounts." />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Plan Management</Text>
          <Text style={styles.subTitle}>Prices, discounts, duration, tags</Text>
        </View>
        <TouchableOpacity onPress={openCreate} style={styles.addBtn} activeOpacity={0.9}>
          <Ionicons name="add" size={18} color={theme.colors.surface} />
          <Text style={styles.addTxt}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {loading ? (
          <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Could not load</Text>
            <Text style={styles.errorMsg}>{error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn} activeOpacity={0.9}>
              <Text style={styles.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {rows.map((p) => {
              const key = String(p.key || '').toLowerCase();
              const isSystemPlan = key === 'trial';
              const calculatedFinal = calcFinal(Number(p.price || 0), Number(p.discount || 0));
              const hasDiscount = Number(p.discount || 0) > 0 && calculatedFinal < Number(p.price || 0);
              return (
                <View key={p._id} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.cardTitle}>{p.name}</Text>
                        <Text style={styles.keyPill}>{String(p.key).toUpperCase()}</Text>
                        {p.tag ? <Text style={styles.tagPill}>{String(p.tag)}</Text> : null}
                        {!p.isActive ? <Text style={styles.offlinePill}>Disabled</Text> : null}
                      </View>
                      <Text style={styles.metaTxt}>
                        Duration: <Text style={styles.metaStrong}>{Number(p.duration || 0)} days</Text>
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        {hasDiscount ? <Text style={styles.strike}>₹{p.price}</Text> : null}
                        <Text style={styles.price}>₹{hasDiscount ? calculatedFinal : p.price}</Text>
                      </View>
                      {hasDiscount ? <Text style={styles.discountTxt}>{Math.round(Number(p.discount || 0))}% OFF</Text> : null}
                    </View>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => toggleActive(p)} style={styles.actionBtn} activeOpacity={0.9}>
                      <Ionicons name={p.isActive ? 'eye-off-outline' : 'eye-outline'} size={16} color={theme.colors.text} />
                      <Text style={styles.actionTxt}>{p.isActive ? 'Disable' : 'Enable'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEdit(p)} style={styles.actionBtn} activeOpacity={0.9}>
                      <Ionicons name="create-outline" size={16} color={theme.colors.text} />
                      <Text style={styles.actionTxt}>Edit</Text>
                    </TouchableOpacity>
                    {!isSystemPlan ? (
                      <TouchableOpacity
                        onPress={() => remove(p)}
                        style={[styles.actionBtn, { borderColor: theme.colors.danger }, deletingId === p._id && { opacity: 0.6 }]}
                        activeOpacity={0.9}
                        disabled={deletingId === p._id}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                        <Text style={[styles.actionTxt, { color: theme.colors.danger }]}>
                          {deletingId === p._id ? 'Deleting…' : 'Delete'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.actionBtn, { opacity: 0.7 }]}>
                        <Ionicons name="lock-closed-outline" size={16} color={theme.colors.mutedText} />
                        <Text style={[styles.actionTxt, { color: theme.colors.mutedText }]}>Protected</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (saving) return;
          setOpen(false);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Plan' : 'Add Plan'}</Text>
            <Text style={styles.modalSub}>Final price auto-calculates from discount.</Text>

            <View style={{ gap: 10, marginTop: 12 }}>
              <Field label="Name" value={fName} onChangeText={setFName} placeholder="Monthly" />
              <Field label="Key" value={fKey} onChangeText={setFKey} placeholder="monthly" autoCapitalize="none" />
              <Field label="Price (₹)" value={fPrice} onChangeText={setFPrice} keyboardType="numeric" />
              <Field label="Discount (%)" value={fDiscount} onChangeText={setFDiscount} keyboardType="numeric" />
              <Field label="Duration (days)" value={fDuration} onChangeText={setFDuration} keyboardType="numeric" />
              <Field label="Tag (optional)" value={fTag} onChangeText={setFTag} placeholder="Popular / Best Value" />

              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Final Price</Text>
                <Text style={styles.previewValue}>₹{finalPreview}</Text>
              </View>
              <TouchableOpacity onPress={() => setFActive((x) => !x)} style={styles.toggleRow} activeOpacity={0.9}>
                <Ionicons name={fActive ? 'checkbox-outline' : 'square-outline'} size={20} color={theme.colors.text} />
                <Text style={styles.toggleTxt}>Active</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.cancelBtn} activeOpacity={0.9} disabled={saving}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.saveBtn, saving && { opacity: 0.7 }]} activeOpacity={0.9} disabled={saving}>
                <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'number-pad' | 'decimal-pad' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function Field({ label, ...rest }: FieldProps) {
  return (
    <View>
      <Text style={{ color: theme.colors.mutedText, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor={theme.colors.mutedText}
        style={{
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: theme.colors.text,
          fontWeight: '800',
        }}
      />
    </View>
  );
}

function withAlpha(hex: string, alpha: number) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

function makeStyles(_mode: 'light' | 'dark') {
  return StyleSheet.create({
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  subTitle: { color: theme.colors.mutedText, fontWeight: '800', fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  addTxt: { color: theme.colors.surface, fontWeight: '900' },

  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 14,
    ...theme.shadow.card,
  },
  cardTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 14 },
  keyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: withAlpha(theme.colors.primary, 0.12),
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 11,
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.primary, 0.20),
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(250,204,21,0.14)',
    color: '#B45309',
    fontWeight: '900',
    fontSize: 11,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.22)',
  },
  offlinePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: withAlpha(theme.colors.danger, 0.10),
    color: theme.colors.danger,
    fontWeight: '900',
    fontSize: 11,
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.danger, 0.18),
  },
  metaTxt: { marginTop: 6, color: theme.colors.mutedText, fontWeight: '800', fontSize: 12 },
  metaStrong: { color: theme.colors.text, fontWeight: '900' },
  price: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
  strike: { color: theme.colors.mutedText, fontWeight: '900', textDecorationLine: 'line-through' },
  discountTxt: { marginTop: 4, color: theme.colors.success, fontWeight: '900', fontSize: 12 },

  actionsRow: { marginTop: 12, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  actionTxt: { color: theme.colors.text, fontWeight: '900', fontSize: 12 },

  errorBox: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14 },
  errorTitle: { color: theme.colors.danger, fontWeight: '900', fontSize: 14 },
  errorMsg: { marginTop: 6, color: theme.colors.mutedText, fontWeight: '800' },
  retryBtn: { marginTop: 10, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  retryTxt: { color: theme.colors.surface, fontWeight: '900' },

  backdrop: { flex: 1, backgroundColor: withAlpha(theme.colors.dark, 0.55), alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: theme.colors.background, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.border },
  modalTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  modalSub: { marginTop: 6, color: theme.colors.mutedText, fontWeight: '800', fontSize: 12 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  previewLabel: { color: theme.colors.mutedText, fontWeight: '900' },
  previewValue: { color: theme.colors.text, fontWeight: '900' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  toggleTxt: { color: theme.colors.text, fontWeight: '900' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 12, alignItems: 'center' },
  cancelTxt: { color: theme.colors.text, fontWeight: '900' },
  saveBtn: { flex: 1, borderRadius: 12, backgroundColor: theme.colors.primary, paddingVertical: 12, alignItems: 'center' },
  saveTxt: { color: theme.colors.surface, fontWeight: '900' },
  });
}

