import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import { useAppStore } from '../../store';
import QRCode from 'react-native-qrcode-svg';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import { useTheme } from '../../theme/ThemeProvider';

const QR_IMAGE = (token: string, size: number) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(token)}`;

export default function AdminAttendance() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const scrollBottom = useScrollBottomForTabBar();
  const dailyQrToken = useAppStore((state) => state.dailyQrToken);
  const generateDailyQr = useAppStore((state) => state.generateDailyQr);
  const fetchAttendanceByDate = useAppStore((state) => state.fetchAttendanceByDate);
  const users = useAppStore((state) => state.users);
  const attendances = useAppStore((state) => state.attendances);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [qrGeneratedAt, setQrGeneratedAt] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const selectedDateObj = useMemo(() => new Date(selectedDate + 'T12:00:00'), [selectedDate]);
  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qrInfo = await generateDailyQr();
      if (!cancelled && qrInfo?.generatedAt) setQrGeneratedAt(qrInfo.generatedAt);
      await fetchAttendanceByDate(format(new Date(), 'yyyy-MM-dd'));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAttendanceByDate(selectedDate);
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchAttendanceByDate, selectedDate]);

  const attendanceRatio = useMemo(() => {
    const total = students.length;
    return total > 0 ? Math.round((attendances.length / total) * 100) : 0;
  }, [attendances.length, students.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAttendanceByDate(selectedDate);
    } finally {
      setRefreshing(false);
    }
  }, [fetchAttendanceByDate, selectedDate]);

  const handlePrint = async () => {
    if (!dailyQrToken) {
      Alert.alert('QR not ready', 'Generate the code first.');
      return;
    }
    setPrinting(true);
    try {
      const src = QR_IMAGE(dailyQrToken, 400);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
        <body style="margin:0;padding:32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
          <p style="font-size:14px;color:#334155;font-weight:700;margin:0 0 20px">Library check-in</p>
          <img src="${src}" width="300" height="300" alt="QR" style="display:block;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px"/>
          <p style="font-size:12px;color:#64748b;margin-top:20px">${format(new Date(), 'd MMM yyyy')}</p>
        </body></html>`;
      await Print.printAsync({ html });
    } catch {
      Alert.alert('Print failed', 'Could not open the printer.');
    } finally {
      setPrinting(false);
    }
  };

  const onDateChange = (event: { type?: string }, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') {
      return;
    }
    if (date) {
      const key = format(date, 'yyyy-MM-dd');
      setSelectedDate(key);
      fetchAttendanceByDate(key);
    }
  };

  const renderRow = (item: (typeof attendances)[0], index: number) => {
    const student = users.find((u) => u.id === item.studentId);

    return (
      <View key={item.id} style={styles.entryCard}>
        {/* Avatar */}
        <View style={styles.entryAvatar}>
          {student?.photoUrl
            ? <Image source={{ uri: student.photoUrl }} style={styles.entryAvatarImg} />
            : <Text style={styles.entryAvatarTxt}>
                {(student?.name || '?').charAt(0).toUpperCase()}
              </Text>
          }
        </View>

        {/* Username */}
        <Text style={styles.entryUsername} numberOfLines={1}>
          @{student?.username || '—'}
        </Text>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Time */}
        <Text style={styles.entryTime}>{format(new Date(item.date), 'h:mm a')}</Text>

        {/* Present badge */}
        <View style={styles.presentBadge}>
          <Ionicons name="checkmark-circle" size={12} color={theme.colors.success} />
          <Text style={styles.presentTxt}>Present</Text>
        </View>
      </View>
    );
  };

  const topSection = (
    <>
      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statChip}>
          <Text style={styles.statChipVal}>{attendances.length}</Text>
          <Text style={styles.statChipLab}>Present</Text>
        </View>
        <View style={styles.statChipDivider} />
        <View style={styles.statChip}>
          <Text style={styles.statChipVal}>{students.length}</Text>
          <Text style={styles.statChipLab}>Members</Text>
        </View>
        <View style={styles.statChipDivider} />
        <View style={styles.statChipWide}>
          <Text style={styles.statChipValSmall}>{attendanceRatio}%</Text>
          <Text style={styles.statChipLab}>of members</Text>
        </View>
      </View>

      {/* QR panel */}
      <View style={styles.qrPanel}>
        <View style={styles.qrInner}>
          {dailyQrToken ? (
            <QRCode value={dailyQrToken} size={168} color={theme.colors.text} backgroundColor={theme.colors.surface} />
          ) : (
            <ActivityIndicator size="large" color={theme.colors.primary} />
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.btnOutline}
            onPress={() => {
              Alert.alert(
                'Confirm QR change',
                'Are you sure you want to change QR code?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Yes, change',
                    onPress: async () => {
                      const qrInfo = await generateDailyQr({ rotate: true });
                      if (qrInfo?.locked) {
                        Alert.alert('Monthly limit', qrInfo.message || 'QR code can be changed only once in a month.');
                        return;
                      }
                      if (qrInfo?.generatedAt) setQrGeneratedAt(qrInfo.generatedAt);
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="sync-outline" size={19} color={theme.colors.primary} />
            <Text style={styles.btnOutlineTxt}>New code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnSolid, (!dailyQrToken || printing) && styles.btnSolidDim]}
            onPress={handlePrint}
            disabled={!dailyQrToken || printing}
            activeOpacity={0.9}
          >
            {printing ? (
              <ActivityIndicator color={theme.colors.dark} size="small" />
            ) : (
              <>
                <Ionicons name="print-outline" size={19} color={theme.colors.dark} />
                <Text style={styles.btnSolidTxt}>Print</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Date picker row */}
      <TouchableOpacity style={styles.dateCard} onPress={() => setShowDatePicker(true)} activeOpacity={0.88}>
        <View style={styles.dateIconWrap}>
          <Ionicons name="calendar-outline" size={22} color={theme.colors.primary} />
        </View>
        <View style={styles.dateTextWrap}>
          <Text style={styles.dateLabel}>{isToday ? 'Today' : 'Selected day'}</Text>
          <Text style={styles.dateHuman}>{format(selectedDateObj, 'EEEE, d MMMM yyyy')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.mutedText} />
      </TouchableOpacity>

      {showDatePicker && Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.dateDoneIos} onPress={() => setShowDatePicker(false)}>
          <Text style={styles.dateDoneTxt}>Done</Text>
        </TouchableOpacity>
      )}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
        />
      )}

    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: scrollBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {topSection}
        {/* Check-ins header */}
        <View style={styles.checkHeader}>
          <View style={styles.checkHeaderLeft}>
            <Ionicons name="checkmark-done-circle" size={18} color={theme.colors.primary} />
            <Text style={styles.listTitle}>Check-ins</Text>
          </View>
          {attendances.length > 0 && (
            <View style={styles.checkCount}>
              <Text style={styles.checkCountTxt}>{attendances.length} entries</Text>
            </View>
          )}
        </View>

        {attendances.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyCircle}>
              <Ionicons name="checkmark-done-outline" size={32} color={theme.colors.mutedText} />
            </View>
            <Text style={styles.emptyTitle}>No check-ins yet</Text>
            <Text style={styles.emptySub}>Nobody has scanned for this day.</Text>
          </View>
        ) : (
          <View style={styles.entriesList}>
            {attendances.map((item, index) => renderRow(item, index))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(mode: 'light' | 'dark') {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  statChip: { flex: 1, alignItems: 'center' },
  statChipWide: { flex: 1.1, alignItems: 'center' },
  statChipVal: { fontSize: 24, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5 },
  statChipValSmall: { fontSize: 22, fontWeight: '800', color: theme.colors.primary, letterSpacing: -0.5 },
  statChipLab: { marginTop: 2, fontSize: 11, fontWeight: '700', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.4 },
  statChipDivider: { width: 1, height: 36, backgroundColor: theme.colors.border },
  qrPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  qrInner: {
    width: 196,
    height: 196,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 22,
    width: '100%',
    gap: 12,
  },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  btnOutlineTxt: { fontSize: 15, fontWeight: '800', color: theme.colors.primary },
  btnSolid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  btnSolidDim: { opacity: 0.5 },
  btnSolidTxt: { fontSize: 15, fontWeight: '800', color: theme.colors.dark },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  dateIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: mode === 'dark' ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTextWrap: { flex: 1 },
  dateLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateHuman: { marginTop: 4, fontSize: 16, fontWeight: '800', color: theme.colors.text },
  dateDoneIos: { alignItems: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
  dateDoneTxt: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  // ── Check-in header ──
  checkHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  checkHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  listTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
  checkCount: {
    backgroundColor: mode === 'dark' ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  checkCountTxt: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },

  // ── Entry cards ──
  entriesList: { gap: 8, marginBottom: 24 },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  entryAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.background,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  entryAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  entryAvatarTxt: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  entryUsername: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  entryTime:   { fontSize: 13, fontWeight: '700', color: theme.colors.mutedText },
  presentBadge:{
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  presentTxt: { fontSize: 11, fontWeight: '700', color: theme.colors.success },

  // ── Empty ──
  emptyCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 40, paddingHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { marginTop: 14, fontSize: 17, fontWeight: '800', color: theme.colors.text },
  emptySub:   { marginTop: 6, fontSize: 14, color: theme.colors.mutedText, textAlign: 'center' },
});
}
