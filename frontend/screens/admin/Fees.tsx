import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Platform, Image, Alert,
  KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, format } from 'date-fns';
import { useAppStore, FeeStatus, User } from '../../store';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type FilterTab = 'All' | 'Paid' | 'Half Paid' | 'Pending';

const FEE_STATUSES: FeeStatus[] = ['Paid', 'Half Paid', 'Pending'];

const STATUS_CONFIG: Record<FeeStatus, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Paid:       { color: '#059669', bg: '#ECFDF5', icon: 'checkmark-circle' },
  'Half Paid':{ color: '#D97706', bg: '#FFFBEB', icon: 'time'             },
  Pending:    { color: '#DC2626', bg: '#FEF2F2', icon: 'close-circle'     },
};

export default function AdminFees() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const users         = useAppStore((s) => s.users);
  const fetchStudents = useAppStore((s) => s.fetchStudents);
  const updateStudent = useAppStore((s) => s.updateStudent);
  const sendNotification = useAppStore((s) => s.sendNotification);

  const [filter,     setFilter]     = useState<FilterTab>('All');
  const [search,     setSearch]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [editStudent, setEditStudent] = useState<User | null>(null);
  const [newFeeStatus, setNewFeeStatus] = useState<FeeStatus>('Paid');
  const [newFeeAmount, setNewFeeAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchStudents(); } finally { setRefreshing(false); }
  }, [fetchStudents]);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const stats = useMemo(() => ({
    total:    students.length,
    paid:     students.filter((s) => s.feeStatus === 'Paid').length,
    halfPaid: students.filter((s) => s.feeStatus === 'Half Paid').length,
    pending:  students.filter((s) => s.feeStatus === 'Pending').length,
    collected: students.filter((s) => s.feeStatus === 'Paid').reduce((sum, s) => sum + (s.feeAmount || 0), 0),
    due:       students.filter((s) => s.feeStatus !== 'Paid').reduce((sum, s) => sum + (s.feeAmount || 0), 0),
  }), [students]);

  const filtered = useMemo(() => {
    let list = students;
    if (filter !== 'All') list = list.filter((s) => s.feeStatus === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || s.mobile.includes(q)
      );
    }
    return list;
  }, [students, filter, search]);

  const openEdit = (student: User) => {
    setEditStudent(student);
    setNewFeeStatus(student.feeStatus);
    setNewFeeAmount(String(student.feeAmount ?? ''));
  };

  const closeEdit = () => { setEditStudent(null); setSaving(false); };

  const saveEdit = async () => {
    if (!editStudent) return;
    const amount = parseFloat(newFeeAmount);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid fee amount.');
      return;
    }
    setSaving(true);
    const res = await updateStudent(editStudent.id, { feeStatus: newFeeStatus, feeAmount: amount });
    setSaving(false);
    if (!res.ok) { Alert.alert('Error', res.message || 'Failed to update fee.'); return; }
    closeEdit();
  };

  const sendFeeReminder = async (student: User) => {
    Alert.alert(
      'Send Fee Reminder',
      `Send a fee reminder to ${student.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            const res = await sendNotification(
              'Fee Payment Reminder',
              `Dear ${student.name}, your library fee of ₹${student.feeAmount} is ${student.feeStatus === 'Pending' ? 'pending' : 'partially paid'}. Please clear dues to continue your membership.`,
              student.id,
              'rules'
            );
            if (res.ok) Alert.alert('Sent', 'Reminder sent to student.');
            else Alert.alert('Error', res.message || 'Failed to send reminder.');
          },
        },
      ]
    );
  };

  const renderItem = ({ item: student }: { item: User }) => {
    const cfg       = STATUS_CONFIG[student.feeStatus];
    const daysLeft  = differenceInDays(new Date(student.expiryDate), new Date());
    const isExpired = daysLeft < 0;

    return (
      <View style={styles.card}>
        {/* Left accent */}
        <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />

        {/* Avatar */}
        {student.photoUrl
          ? <Image source={{ uri: student.photoUrl }} style={styles.avatar} />
          : <View style={[styles.avatarBox, { backgroundColor: cfg.color + '20' }]}>
              <Text style={[styles.avatarInitial, { color: cfg.color }]}>
                {student.name.charAt(0).toUpperCase()}
              </Text>
            </View>
        }

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{student.name}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>@{student.username} · {student.mobile}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardExpiry}>
              {isExpired
                ? `Expired ${Math.abs(daysLeft)}d ago`
                : `Expires in ${daysLeft}d`
              }
            </Text>
            <Text style={[styles.cardAmount, { color: cfg.color }]}>₹{student.feeAmount}</Text>
          </View>
        </View>

        {/* Status + Actions */}
        <View style={styles.cardRight}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={11} color={cfg.color} />
            <Text style={[styles.statusTxt, { color: cfg.color }]}>{student.feeStatus}</Text>
          </View>
          <View style={styles.cardActions}>
            {student.feeStatus !== 'Paid' && (
              <TouchableOpacity
                onPress={() => sendFeeReminder(student)}
                style={styles.reminderBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="notifications-outline" size={15} color="#D97706" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => openEdit(student)}
              style={styles.editBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={15} color="#4F46E5" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>

      {/* ── Summary banner ── */}
      <LinearGradient
        colors={['#059669', '#10B981']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.banner}
      >
        <View style={styles.bannerDecCircle} />
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerLabel}>Total Collected</Text>
          <Text style={styles.bannerValue}>₹{stats.collected.toLocaleString()}</Text>
          <Text style={styles.bannerSub}>Pending dues: ₹{stats.due.toLocaleString()}</Text>
        </View>
        <View style={styles.bannerRight}>
          <View style={styles.bannerStat}>
            <Text style={styles.bannerStatVal}>{stats.paid}</Text>
            <Text style={styles.bannerStatLbl}>Paid</Text>
          </View>
          <View style={[styles.bannerDivider]} />
          <View style={styles.bannerStat}>
            <Text style={styles.bannerStatVal}>{stats.halfPaid}</Text>
            <Text style={styles.bannerStatLbl}>Half</Text>
          </View>
          <View style={[styles.bannerDivider]} />
          <View style={styles.bannerStat}>
            <Text style={styles.bannerStatVal}>{stats.pending}</Text>
            <Text style={styles.bannerStatLbl}>Due</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.colors.mutedText} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, username or mobile..."
          placeholderTextColor={theme.colors.mutedText}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={theme.colors.mutedText} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter tabs ── */}
      <View style={styles.tabRow}>
        {(['All', 'Paid', 'Half Paid', 'Pending'] as FilterTab[]).map((tab) => {
          const active = filter === tab;
          const count  = tab === 'All' ? stats.total
            : tab === 'Paid' ? stats.paid
            : tab === 'Half Paid' ? stats.halfPaid
            : stats.pending;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{tab}</Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text style={[styles.tabCountTxt, active && styles.tabCountTxtActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── List ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={44} color={theme.colors.mutedText} />
            <Text style={styles.emptyTitle}>No students found</Text>
            <Text style={styles.emptySub}>Try a different filter or search term.</Text>
          </View>
        }
      />

      {/* ── Edit Fee Modal ── */}
      <Modal visible={!!editStudent} transparent animationType="slide" onRequestClose={closeEdit}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={closeEdit} />
          <View style={styles.sheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>Update Fee</Text>
            {editStudent && (
              <Text style={styles.sheetSub}>{editStudent.name} · @{editStudent.username}</Text>
            )}

            {/* Fee amount */}
            <Text style={styles.fieldLabel}>Fee Amount (₹)</Text>
            <View style={styles.amountRow}>
              <Ionicons name="cash-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={newFeeAmount}
                onChangeText={setNewFeeAmount}
                placeholder="0"
                placeholderTextColor={theme.colors.mutedText}
              />
            </View>

            {/* Fee status */}
            <Text style={styles.fieldLabel}>Fee Status</Text>
            <View style={styles.statusOptions}>
              {FEE_STATUSES.map((status) => {
                const cfg    = STATUS_CONFIG[status];
                const active = newFeeStatus === status;
                return (
                  <TouchableOpacity
                    key={status}
                    onPress={() => setNewFeeStatus(status)}
                    style={[
                      styles.statusOption,
                      active && { backgroundColor: cfg.bg, borderColor: cfg.color },
                    ]}
                  >
                    <Ionicons
                      name={cfg.icon}
                      size={18}
                      color={active ? cfg.color : theme.colors.mutedText}
                    />
                    <Text style={[styles.statusOptionTxt, active && { color: cfg.color, fontWeight: '700' }]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveEdit}
              disabled={saving}
            >
              <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.saveBtnGrad}
              >
                <Ionicons name={saving ? 'hourglass' : 'checkmark-circle'} size={18} color="#fff" />
                <Text style={styles.saveBtnTxt}>{saving ? 'Saving…' : 'Save Changes'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={closeEdit} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },

  // ── Banner ──
  banner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 12,
    borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#059669', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14 },
      android: { elevation: 5 },
    }),
  },
  bannerDecCircle: {
    position: 'absolute', top: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bannerLeft:     { flex: 1 },
  bannerLabel:    { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  bannerValue:    { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.8 },
  bannerSub:      { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  bannerRight:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerStat:     { alignItems: 'center' },
  bannerStatVal:  { fontSize: 18, fontWeight: '900', color: '#fff' },
  bannerStatLbl:  { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  bannerDivider:  { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: theme.colors.surface, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.colors.border,
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', color: theme.colors.text },

  // ── Tabs ──
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16, marginBottom: 12, gap: 8,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  tabBtnActive:    { backgroundColor: 'rgba(13,148,136,0.12)', borderColor: theme.colors.primary },
  tabTxt:          { fontSize: 11, fontWeight: '600', color: theme.colors.mutedText },
  tabTxtActive:    { color: theme.colors.primary },
  tabCount:        { backgroundColor: theme.colors.background, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabCountActive:  { backgroundColor: theme.colors.primary },
  tabCountTxt:     { fontSize: 10, fontWeight: '700', color: theme.colors.mutedText },
  tabCountTxtActive: { color: '#fff' },

  // ── List ──
  list: { paddingHorizontal: 16, paddingBottom: 100 },

  // ── Card ──
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderRadius: 14, marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1, borderColor: theme.colors.border,
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardAccent:   { width: 4, alignSelf: 'stretch' },
  avatar:       { width: 42, height: 42, borderRadius: 21, marginLeft: 10 },
  avatarBox:    { width: 42, height: 42, borderRadius: 21, marginLeft: 10, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontWeight: '800' },
  cardInfo:     { flex: 1, paddingHorizontal: 10, paddingVertical: 12 },
  cardName:     { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  cardSub:      { fontSize: 11, fontWeight: '500', color: theme.colors.mutedText, marginTop: 1 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardExpiry:   { fontSize: 10, fontWeight: '600', color: theme.colors.mutedText },
  cardAmount:   { fontSize: 12, fontWeight: '800' },
  cardRight:    { alignItems: 'flex-end', paddingRight: 12, gap: 8 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusTxt:    { fontSize: 10, fontWeight: '700' },
  cardActions:  { flexDirection: 'row', gap: 8 },
  reminderBtn:  { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 5, borderWidth: 1, borderColor: theme.colors.border },
  editBtn:      { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 5, borderWidth: 1, borderColor: theme.colors.border },

  // ── Empty ──
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  emptySub:   { fontSize: 13, color: theme.colors.mutedText },

  // ── Modal / Sheet ──
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, paddingTop: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: theme.colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginBottom: 2 },
  sheetSub:   { fontSize: 13, fontWeight: '500', color: theme.colors.mutedText, marginBottom: 20 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.mutedText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.background, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
  },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '700', color: theme.colors.text },

  statusOptions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statusOption: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: theme.colors.background, borderWidth: 1.5, borderColor: theme.colors.border,
  },
  statusOptionTxt: { fontSize: 11, fontWeight: '600', color: theme.colors.mutedText },

  saveBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  saveBtnTxt:  { fontSize: 16, fontWeight: '800', color: '#fff' },

  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelTxt:  { fontSize: 15, fontWeight: '600', color: theme.colors.mutedText },
});
}
