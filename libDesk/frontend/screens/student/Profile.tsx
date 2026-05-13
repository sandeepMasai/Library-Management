import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../../store';
import { useFocusEffect } from '@react-navigation/native';
import { apiGet, type ApiError } from '../../services/api';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import { SignOutConfirmModal } from '../../components/SignOutConfirmModal';
import { ConfirmModal } from '../../components/ConfirmModal';

const { width } = Dimensions.get('window');
const CARD_W = width - 40;

export default function StudentProfile() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const scrollBottom = useScrollBottomForTabBar();
  const currentUser = useAppStore((s) => s.currentUser);
  const role = useAppStore((s) => s.role);
  const users = useAppStore((s) => s.users);
  const attendances = useAppStore((s) => s.attendances);
  const fetchStudentAttendance = useAppStore((s) => s.fetchStudentAttendance);
  const uploadMyPhoto = useAppStore((s) => s.uploadMyPhoto);
  const logout = useAppStore((s) => s.logout);
  const [uploading, setUploading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; description?: string } | null>(null);

  // Bootstrap on direct navigation / reload (when token exists but currentUser is not hydrated yet).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (currentUser) return;
      if (role !== 'student') return;
      setBootLoading(true);
      setBootError(null);
      try {
        const data = await apiGet<any>(`/api/student/me`);
        if (!data?.student?.id) throw new Error('Invalid student payload');
        useAppStore.setState((s) => ({
          currentUser: data.student,
          users: [...s.users.filter((u) => u.id !== data.student.id), data.student],
          notifications: Array.isArray(data.notifications) ? data.notifications : s.notifications,
        }));
        await fetchStudentAttendance(data.student.id);
      } catch (e: any) {
        const err = e as ApiError;
        if (!cancelled) setBootError(err?.message || 'Failed to load profile');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, role, fetchStudentAttendance]);

  useFocusEffect(
    useCallback(() => {
      if (currentUser) fetchStudentAttendance(currentUser.id);
    }, [currentUser, fetchStudentAttendance])
  );

  const stats = useMemo(() => {
    if (!currentUser) return { total: 0, thisMonth: 0, streak: 0, daysLeft: 0, isExpired: false };
    const now = new Date();
    const mine = [...attendances.filter((a) => a.studentId === currentUser.id)]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const thisMonth = mine.filter((a) => {
      const d = new Date(a.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    // Simple streak: consecutive days from today backwards
    let streak = 0;
    const check = new Date(now);
    for (const rec of mine) {
      const d = new Date(rec.date);
      if (
        d.getDate() === check.getDate() &&
        d.getMonth() === check.getMonth() &&
        d.getFullYear() === check.getFullYear()
      ) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else break;
    }
    const daysLeft = differenceInDays(new Date(currentUser.expiryDate), now);
    return { total: mine.length, thisMonth, streak, daysLeft, isExpired: daysLeft < 0 };
  }, [attendances, currentUser]);

  if (!currentUser) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, marginTop: 16 }}>
          {bootLoading ? (
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
          ) : bootError ? (
            <>
              <Text style={{ color: '#DC2626', fontWeight: '900', marginBottom: 6 }}>Could not load</Text>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' }}>{bootError}</Text>
              <TouchableOpacity
                onPress={logout}
                activeOpacity={0.85}
                style={{ marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.dark }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>Logout</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setInfoModal({
        title: 'Permission required',
        description: 'Allow photo library access to update your profile photo.',
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    // Student self-service photo update:
    // POST /api/student/me/photo (token scoped)
    const r = await uploadMyPhoto(result.assets[0].uri);
    setUploading(false);
    if (!r.ok) {
      setInfoModal({
        title: 'Upload failed',
        description: r.message || 'Could not upload photo.',
      });
    }
  };

  const onLogout = () => {
    setShowSignOutModal(true);
  };

  const closeSignOutModal = () => {
    if (signOutLoading) return;
    setShowSignOutModal(false);
  };

  const confirmSignOut = async () => {
    if (signOutLoading) return;
    setSignOutLoading(true);
    try {
      logout();
      setShowSignOutModal(false);
    } finally {
      setSignOutLoading(false);
    }
  };

  // Delete account removed from Student app UI.

  const feeColor =
    currentUser.feeStatus === 'Paid'
      ? theme.colors.success
      : currentUser.feeStatus === 'Half Paid'
      ? theme.colors.warning
      : theme.colors.danger;
  const feeBg =
    currentUser.feeStatus === 'Paid'
      ? 'rgba(34,197,94,0.16)'
      : currentUser.feeStatus === 'Half Paid'
      ? 'rgba(245,158,11,0.16)'
      : 'rgba(239,68,68,0.16)';
  const expiryColor = stats.isExpired ? theme.colors.danger : stats.daysLeft <= 7 ? theme.colors.warning : theme.colors.success;
  const ringColor = stats.isExpired ? '#EF4444' : '#6366F1';

  const titleCase = (input: string) =>
    String(input || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

  const libraryName = currentUser.library?.libraryName || 'Library';
  const displayName = titleCase(currentUser.name);
  const displayLibrary = libraryName.toUpperCase();
  const libraryLogo = currentUser.library?.logoUrl || null;

  // membership progress
  const joinTs = new Date(currentUser.joinDate).getTime();
  const expTs = new Date(currentUser.expiryDate).getTime();
  const prog = Math.min(Math.max((Date.now() - joinTs) / (expTs - joinTs), 0), 1);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottom }]}
      >

        {/* ── Avatar + name ── */}
        <View style={styles.topSection}>
          <TouchableOpacity
            onPress={handlePickPhoto}
            disabled={uploading}
            activeOpacity={0.85}
            style={styles.avatarRingWrap}
          >
            <LinearGradient
              colors={stats.isExpired ? ['#EF4444', '#DC2626'] : ['#6366F1', '#8B5CF6']}
              style={styles.avatarRing}
            >
              {currentUser.photoUrl
                ? <Image source={{ uri: currentUser.photoUrl }} style={styles.avatar} />
                : <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{currentUser.name.charAt(0).toUpperCase()}</Text>
                </View>
              }
            </LinearGradient>
            <View style={[styles.cameraBtn, { backgroundColor: ringColor }]}>
              <Ionicons name={uploading ? 'cloud-upload-outline' : 'camera-outline'} size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>@{currentUser.username}  ·  {currentUser.mobile}</Text>
          <View style={styles.libraryRow}>
            {libraryLogo ? (
              <Image source={{ uri: libraryLogo }} style={styles.libraryLogo} />
            ) : (
              <View style={styles.libraryLogoFallback}>
                <Text style={styles.libraryLogoTxt}>{libraryName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.libraryName} numberOfLines={1}>
              {displayLibrary}
            </Text>
          </View>

          {/* Status badges */}
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: stats.isExpired ? 'rgba(239,68,68,0.16)' : 'rgba(34,197,94,0.16)',
                  borderColor: stats.isExpired ? 'rgba(239,68,68,0.28)' : 'rgba(34,197,94,0.28)',
                },
              ]}
            >
              <View style={[styles.pillDot, { backgroundColor: expiryColor }]} />
              <Text style={[styles.pillTxt, { color: expiryColor }]}>
                {stats.isExpired ? 'Expired' : 'Active'}
              </Text>
            </View>
            <View style={[styles.pill, { backgroundColor: feeBg, borderColor: feeColor + '66' }]}>
              <Ionicons name="cash-outline" size={10} color={feeColor} />
              <Text style={[styles.pillTxt, { color: feeColor }]}>{currentUser.feeStatus}</Text>
            </View>
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <StatBox value={stats.thisMonth} label="This month" icon="calendar" color="#6366F1" />
          <StatBox value={stats.total} label="Total visits" icon="checkmark-circle" color="#0EA5E9" />
          <StatBox value={stats.streak} label="Day streak" icon="flame" color="#F97316" />
        </View>

        {/* ── Library membership card ── */}
        <LinearGradient
          colors={['#1E1B4B', '#3730A3', '#4F46E5']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.memberCard}
        >
          {/* decorations */}
          <View style={styles.mcCircle1} />
          <View style={styles.mcCircle2} />

          {/* top row */}
          <View style={styles.mcTop}>
            <View style={styles.mcIconBox}>
              <Ionicons name="library" size={16} color="#fff" />
            </View>
            <Text style={styles.mcLibrary} numberOfLines={1}>
              {displayLibrary}
            </Text>
            <View style={[styles.mcChip, { backgroundColor: stats.isExpired ? '#EF4444' : '#22C55E' }]}>
              <Text style={styles.mcChipTxt}>{stats.isExpired ? 'EXPIRED' : 'VALID'}</Text>
            </View>
          </View>

          {/* name */}
          <Text style={styles.mcName}>{displayName.toUpperCase()}</Text>
          <Text style={styles.mcMemberMeta} numberOfLines={1}>
            {displayLibrary}
          </Text>

          {/* divider dots */}
          <View style={styles.mcDots}>
            {Array.from({ length: 24 }).map((_, i) => (
              <View key={i} style={styles.mcDot} />
            ))}
          </View>

          {/* dates + progress */}
          <View style={styles.mcDates}>
            <View>
              <Text style={styles.mcDateLbl}>VALID FROM</Text>
              <Text style={styles.mcDateVal}>{format(new Date(currentUser.joinDate), 'dd MMM yyyy')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.mcDateLbl}>VALID TO</Text>
              <Text style={[styles.mcDateVal, { color: stats.isExpired ? '#FCA5A5' : '#86EFAC' }]}>
                {format(new Date(currentUser.expiryDate), 'dd MMM yyyy')}
              </Text>
            </View>
          </View>

          {/* progress bar */}
          <View style={styles.mcProgressBg}>
            <LinearGradient
              colors={stats.isExpired ? ['#EF4444', '#DC2626'] : ['#6EE7B7', '#22C55E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.mcProgressFill, { width: `${Math.round(prog * 100)}%` as any }]}
            />
          </View>
          <Text style={styles.mcProgressLbl}>
            {stats.isExpired
              ? `Expired ${Math.abs(stats.daysLeft)}d ago`
              : `${Math.max(stats.daysLeft, 0)} days remaining`}
          </Text>
        </LinearGradient>

        {/* ── Fee section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fee Details</Text>
          <View style={styles.feeGrid}>
            <View style={[styles.feeBox, { backgroundColor: feeBg, borderColor: feeColor + '40' }]}>
              <Ionicons name="cash" size={22} color={feeColor} />
              <Text style={[styles.feeBoxVal, { color: feeColor }]}>{currentUser.feeStatus}</Text>
              <Text style={styles.feeBoxLbl}>Status</Text>
            </View>
            <View
              style={[
                styles.feeBox,
                {
                  backgroundColor: feeBg,
                  borderColor: feeColor + '40',
                },
              ]}
            >
              <Ionicons name="wallet" size={22} color={feeColor} />
              <Text style={[styles.feeBoxVal, { color: feeColor }]}>₹{currentUser.feeAmount}</Text>
              <Text style={styles.feeBoxLbl}>Amount</Text>
            </View>
          </View>
        </View>

        {/* ── Info section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Info</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="person-outline" label="Full Name" value={displayName} />
            <InfoRow icon="at-outline" label="Username" value={`@${String(currentUser.username || '').toUpperCase()}`} />
            <InfoRow icon="call-outline" label="Mobile" value={currentUser.mobile} last />
          </View>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity onPress={onLogout} activeOpacity={0.85} style={styles.signOutBtn}>
          <View style={styles.signOutIconBox}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          </View>
          <Text style={styles.signOutTxt}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color="#FCA5A5" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <Text style={styles.versionTxt}>libDesk v1.0.0</Text>

      </ScrollView>

      <SignOutConfirmModal
        visible={showSignOutModal}
        loading={signOutLoading}
        onCancel={closeSignOutModal}
        onConfirm={confirmSignOut}
      />

      <ConfirmModal
        visible={!!infoModal}
        tone="neutral"
        label="INFO"
        title={infoModal?.title ?? 'Info'}
        description={infoModal?.description}
        showCancel={false}
        confirmText="OK"
        confirmIcon="checkmark-outline"
        onCancel={() => setInfoModal(null)}
        onConfirm={() => setInfoModal(null)}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ value, label, icon, color }: {
  value: number; label: string;
  icon: keyof typeof Ionicons.glyphMap; color: string;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string; value: string; last?: boolean;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <View style={styles.infoIconBox}>
          <Ionicons name={icon} size={14} color="#6366F1" />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles() {
  const dangerBg = 'rgba(239,68,68,0.10)';
  const dangerBorder = 'rgba(239,68,68,0.28)';
  const dangerIconBg = 'rgba(239,68,68,0.14)';

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { paddingBottom: 36 },

    // ── Top section ──
    topSection: {
      alignItems: 'center',
      paddingTop: 24, paddingBottom: 20,


      backgroundColor: theme.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    avatarRingWrap: { position: 'relative', marginBottom: 14 },
    avatarRing: {
      width: 96, height: 96, borderRadius: 48,
      padding: 3,
      alignItems: 'center', justifyContent: 'center',
    },
    avatar: { width: 90, height: 90, borderRadius: 45 },
    avatarFallback: {
      width: 90, height: 90, borderRadius: 45,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarInitial: { fontSize: 36, fontWeight: '900', color: theme.colors.primary },
    cameraBtn: {
      position: 'absolute', bottom: 2, right: 2,
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: theme.colors.surface,
    },
    name: { fontSize: 22, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.4, marginBottom: 2 },
    username: { fontSize: 13, fontWeight: '500', color: theme.colors.mutedText, marginBottom: 12 },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  libraryLogo: { width: 18, height: 18, borderRadius: 6, backgroundColor: theme.colors.background },
  libraryLogoFallback: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryLogoTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.primary },
  libraryName: {
    flexShrink: 1,
    maxWidth: CARD_W - 90,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mutedText,
    textAlign: 'center',
  },
    badgeRow: { flexDirection: 'row', gap: 8 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 20, borderWidth: 1,
    },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillTxt: { fontSize: 11, fontWeight: '700' },

    // ── Stats row ──
    statsRow: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      marginTop: 12, marginHorizontal: 16,
      borderRadius: 18, paddingVertical: 16,
      borderWidth: 1, borderColor: theme.colors.border,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10 },
        android: { elevation: 3 },
      }),
    },
    statBox: { flex: 1, alignItems: 'center', gap: 4 },
    statIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    statVal: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
    statLbl: { fontSize: 10, fontWeight: '600', color: theme.colors.mutedText },

    // ── Membership card ──
    memberCard: {
      marginHorizontal: 16, marginTop: 14,
      borderRadius: 20, padding: 20,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 20 },
        android: { elevation: 8 },
      }),
    },
    mcCircle1: {
      position: 'absolute', top: -50, right: -50,
      width: 180, height: 180, borderRadius: 90,
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    mcCircle2: {
      position: 'absolute', bottom: -30, left: -30,
      width: 130, height: 130, borderRadius: 65,
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    mcTop: {
      flexDirection: 'row', alignItems: 'center',
      marginBottom: 16, gap: 8,
    },
    mcIconBox: {
      width: 30, height: 30, borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center', justifyContent: 'center',
    },
    mcLibrary: { flex: 1, fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1 },
    mcChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    mcChipTxt: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
    mcName: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 1, marginBottom: 6 },
    mcMemberMeta: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.78)', letterSpacing: 0.2, marginBottom: 14 },
    mcDots: { flexDirection: 'row', gap: 3, marginBottom: 14 },
    mcDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
    mcDates: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    mcDateLbl: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 2 },
    mcDateVal: { fontSize: 13, fontWeight: '700', color: '#fff' },
    mcProgressBg: { height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, marginBottom: 6, overflow: 'hidden' },
    mcProgressFill: { height: 5, borderRadius: 3 },
    mcProgressLbl: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', textAlign: 'right' },

    // ── Fee section ──
    section: { marginHorizontal: 16, marginTop: 14 },
    sectionTitle: {
      fontSize: 13, fontWeight: '800', color: theme.colors.mutedText,
      textTransform: 'uppercase', letterSpacing: 0.6,
      marginBottom: 8,
    },
    feeGrid: { flexDirection: 'row', gap: 10 },
    feeBox: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingVertical: 16, borderRadius: 16, gap: 4,
      borderWidth: 1,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
        android: { elevation: 2 },
      }),
    },
    feeBoxVal: { fontSize: 15, fontWeight: '800' },
    feeBoxLbl: { fontSize: 10, fontWeight: '600', color: theme.colors.mutedText },

    // ── Info card ──
    infoCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      borderWidth: 1, borderColor: theme.colors.border,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
        android: { elevation: 2 },
      }),
    },
    infoRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14, paddingVertical: 13,
    },
    infoRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    infoIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
    infoLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.mutedText },
    infoValue: { fontSize: 14, fontWeight: '700', color: theme.colors.text },

    // ── Sign out ──
    signOutBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16, marginTop: 14,
      borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
      borderWidth: 1, borderColor: theme.colors.border,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
        android: { elevation: 1 },
      }),
    },
    signOutIconBox: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    signOutTxt: { fontSize: 15, fontWeight: '800', color: theme.colors.text },

    // ── Danger variant (Delete account) ──
    dangerBtn: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    dangerIconBox: {
      backgroundColor: dangerIconBg,
      borderColor: dangerBorder,
    },
    dangerTxt: {
      color: theme.colors.danger,
    },
    versionTxt: { textAlign: 'center', fontSize: 11, color: theme.colors.mutedText, marginTop: 20, fontWeight: '500' },
  });
}
