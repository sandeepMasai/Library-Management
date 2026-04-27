import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme/ThemeProvider';

type DayStatus = 'present' | 'absent' | 'future' | 'empty';

type CalendarCell = {
  key: string;
  day: number | null;
  status: DayStatus;
  isToday: boolean;
};

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Monday = 0 … Sunday = 6 */
function mondayIndex(jsDay: number) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function DayCell({
  styles,
  day,
  status,
  isToday,
  size,
}: {
  styles: ReturnType<typeof makeStyles>;
  day: number | null;
  status: DayStatus;
  isToday: boolean;
  size: number;
}) {
  if (status === 'empty' || day === null) {
    return <View style={{ width: size, height: size * 0.92 }} />;
  }

  const isFuture = status === 'future';
  const present = status === 'present';
  const absent = status === 'absent';

  return (
    <View style={[styles.dayWrap, { width: size }]}>
      <View
        style={[
          styles.dayInner,
          { width: size - 4, minHeight: size - 4 },
          isToday && styles.dayToday,
          present && styles.dayPresent,
          absent && !isFuture && styles.dayAbsent,
          isFuture && styles.dayFuture,
        ]}
      >
        <Text
          style={[
            styles.dayNum,
            isFuture && styles.dayNumFuture,
            present && styles.dayNumPresent,
            absent && !isFuture && styles.dayNumAbsent,
          ]}
        >
          {day}
        </Text>
        {present && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={11} color={theme.colors.dark} />
          </View>
        )}
        {absent && !isFuture && <View style={styles.absentMark} />}
      </View>
    </View>
  );
}

export default function StudentCalendarScreen() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const currentUser = useAppStore((state) => state.currentUser);
  const attendances = useAppStore((s) => s.attendances);
  const fetchStudentAttendance = useAppStore((s) => s.fetchStudentAttendance);
  const [refreshing, setRefreshing] = useState(false);

  const realToday = new Date();
  const [viewYear, setViewYear] = useState(realToday.getFullYear());
  const [viewMonth, setViewMonth] = useState(realToday.getMonth() + 1);

  const { width: winW } = useWindowDimensions();
  const scrollBottom = useScrollBottomForTabBar();
  const cellSize = Math.max(40, Math.floor((winW - 32 * 2) / 7));

  const fetchAttendance = useCallback(async () => {
    if (!currentUser) return;
    await fetchStudentAttendance(currentUser.id, viewYear, viewMonth);
  }, [currentUser, fetchStudentAttendance, viewMonth, viewYear]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useFocusEffect(
    useCallback(() => {
      fetchAttendance();
    }, [fetchAttendance])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAttendance();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAttendance]);

  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}-`;
  const monthAttendances = useMemo(
    () => (currentUser ? attendances.filter((a) => a.studentId === currentUser.id && a.date.startsWith(monthPrefix)) : []),
    [attendances, currentUser, monthPrefix]
  );
  const presentSet = useMemo(() => new Set(monthAttendances.map((a) => a.date.slice(0, 10))), [monthAttendances]);

  const { cells, presentCount, absentCount, daysInMonth } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const dim = new Date(viewYear, viewMonth, 0).getDate();
    const leading = mondayIndex(firstDay.getDay());

    const cellsBuild: CalendarCell[] = [];
    for (let i = 0; i < leading; i += 1) {
      cellsBuild.push({ key: `empty-${i}`, day: null, status: 'empty', isToday: false });
    }

    let p = 0;
    let a = 0;

    for (let day = 1; day <= dim; day += 1) {
      const key = dateKey(viewYear, viewMonth, day);
      const currentDate = new Date(viewYear, viewMonth - 1, day);
      const todayStart = new Date(realToday.getFullYear(), realToday.getMonth(), realToday.getDate());
      const isFuture = currentDate > todayStart;
      let status: DayStatus;

      if (isFuture) {
        status = 'future';
      } else if (presentSet.has(key)) {
        status = 'present';
        p += 1;
      } else {
        status = 'absent';
        a += 1;
      }

      cellsBuild.push({
        key,
        day,
        status,
        isToday:
          day === realToday.getDate() &&
          viewMonth === realToday.getMonth() + 1 &&
          viewYear === realToday.getFullYear(),
      });
    }

    return { cells: cellsBuild, presentCount: p, absentCount: a, daysInMonth: dim };
  }, [presentSet, realToday, viewMonth, viewYear]);

  const pastDaysInMonth = presentCount + absentCount;
  const ratePct = pastDaysInMonth > 0 ? Math.round((presentCount / pastDaysInMonth) * 100) : 0;

  const recentPresents = useMemo(() => {
    return [...monthAttendances]
      .map((x) => x.date.slice(0, 10))
      .sort((x, y) => y.localeCompare(x))
      .slice(0, 8);
  }, [monthAttendances]);

  const goPrevMonth = () => {
    if (viewMonth <= 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth >= 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isCurrentMonth = viewMonth === realToday.getMonth() + 1 && viewYear === realToday.getFullYear();
  const jumpToToday = () => {
    setViewYear(realToday.getFullYear());
    setViewMonth(realToday.getMonth() + 1);
  };

  if (!currentUser) return null;

  const monthLabel = format(new Date(viewYear, viewMonth - 1, 1), 'MMMM yyyy');

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroKicker}>Your attendance</Text>
              <Text style={styles.heroTitle}>{monthLabel}</Text>
            </View>
            <View style={styles.heroRing}>
              <Text style={styles.heroPct}>{ratePct}%</Text>
              <Text style={styles.heroPctSub}>this period</Text>
            </View>
          </View>
          <View style={styles.heroBar}>
            <View style={[styles.heroBarFill, { width: `${ratePct}%` }]} />
          </View>
          <Text style={styles.heroCaption}>
            {presentCount} present · {absentCount} missed · {daysInMonth} days in month
          </Text>
        </View>

        {/* Month control */}
        <View style={styles.monthNav}>
          <Pressable onPress={goPrevMonth} style={styles.monthBtn} android_ripple={null}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.monthCenter}>
            <Text style={styles.monthCenterText}>{format(new Date(viewYear, viewMonth - 1, 1), 'MMM yyyy')}</Text>
            {!isCurrentMonth && (
              <Pressable onPress={jumpToToday} android_ripple={null} style={styles.todayLink}>
                <Text style={styles.todayLinkText}>Today</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={goNextMonth} style={styles.monthBtn} android_ripple={null}>
            <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* Calendar grid */}
        <View style={styles.calCard}>
          <View style={styles.weekRow}>
            {WEEK_LABELS.map((w, i) => (
              <View key={`${w}-${i}`} style={[styles.weekCell, { width: cellSize }]}>
                <Text style={styles.weekText}>{w}</Text>
              </View>
            ))}
          </View>
          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, row) => (
              <View key={`row-${row}`} style={styles.gridRow}>
                {cells.slice(row * 7, row * 7 + 7).map((cell) => (
                  <DayCell
                    key={cell.key}
                    styles={styles}
                    day={cell.day}
                    status={cell.status}
                    isToday={cell.isToday}
                    size={cellSize}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} />
              <Text style={styles.legendText}>Present</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.danger }]} />
              <Text style={styles.legendText}>Missed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.border }]} />
              <Text style={styles.legendText}>Upcoming</Text>
            </View>
          </View>
        </View>

        {/* Recent */}
        <View style={styles.recentBlock}>
          <Text style={styles.recentTitle}>Recent check-ins</Text>
          <Text style={styles.recentSub}>Latest days you scanned at the library</Text>
          {recentPresents.length === 0 ? (
            <View style={styles.recentEmpty}>
              <Ionicons name="qr-code-outline" size={36} color={theme.colors.mutedText} />
              <Text style={styles.recentEmptyText}>No scans this month yet</Text>
              <Text style={styles.recentEmptyHint}>Use Scan to mark attendance when you arrive</Text>
            </View>
          ) : (
            recentPresents.map((d) => (
              <View key={d} style={styles.recentRow}>
                <View style={styles.recentIcon}>
                  <Ionicons name="checkmark" size={16} color={theme.colors.success} />
                </View>
                <View style={styles.recentTextWrap}>
                  <Text style={styles.recentDate}>{format(parseISO(d), 'EEEE, d MMMM')}</Text>
                  <Text style={styles.recentMeta}>{format(parseISO(d), 'yyyy-MM-dd')}</Text>
                </View>
                <View style={styles.recentPill}>
                  <Text style={styles.recentPillText}>Present</Text>
                </View>
              </View>
            ))
          )}
        </View>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  hero: {
    backgroundColor: theme.colors.primary,
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#1E1B4B',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPct: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  heroPctSub: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroBar: {
    marginTop: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  heroBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#34D399',
    maxWidth: '100%',
  },
  heroCaption: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  monthBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  monthCenter: {
    alignItems: 'center',
  },
  monthCenterText: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  todayLink: {
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  todayLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  calCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  weekCell: {
    alignItems: 'center',
  },
  weekText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.mutedText,
  },
  grid: {
    gap: 4,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  dayWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  dayInner: {
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  },
  dayToday: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: mode === 'dark' ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.10)',
  },
  dayPresent: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.26)',
  },
  dayAbsent: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderColor: 'rgba(239,68,68,0.26)',
  },
  dayFuture: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    opacity: 0.85,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  dayNumFuture: {
    color: theme.colors.mutedText,
  },
  dayNumPresent: {
    color: theme.colors.success,
  },
  dayNumAbsent: {
    color: theme.colors.danger,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  absentMark: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.danger,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mutedText,
  },
  recentBlock: {
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  recentTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  recentSub: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.mutedText,
    fontWeight: '500',
    marginBottom: 14,
  },
  recentEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  recentEmptyText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.mutedText,
  },
  recentEmptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.mutedText,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  recentDate: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  recentMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mutedText,
  },
  recentPill: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  recentPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.success,
  },
});
}
