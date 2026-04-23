import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

export type AttendanceDayStatus = 'present' | 'absent' | 'future' | 'empty';

interface AttendanceCardProps {
  day: number | null;
  status: AttendanceDayStatus;
  isToday?: boolean;
}

export default function AttendanceCard({ day, status, isToday = false }: AttendanceCardProps) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  if (status === 'empty') {
    return <View style={styles.emptyCell} />;
  }

  const isFuture = status === 'future';

  return (
    <View style={[styles.cell, isToday && styles.todayCell, isFuture && styles.futureCell]}>
      <Text style={[styles.dayText, isFuture && styles.futureText]}>{day}</Text>
      {status === 'present' && <View style={[styles.dot, { backgroundColor: theme.colors.success }]} />}
      {status === 'absent' && <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} />}
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    emptyCell: {
      flex: 1,
      margin: 2,
      minHeight: 40,
    },
    cell: {
      flex: 1,
      margin: 2,
      minHeight: 40,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    todayCell: {
      borderColor: theme.colors.primary,
      backgroundColor: 'rgba(13,148,136,0.12)',
    },
    futureCell: {
      backgroundColor: theme.colors.surface,
      opacity: 0.7,
    },
    dayText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
    },
    futureText: {
      color: theme.colors.mutedText,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
  });
}
