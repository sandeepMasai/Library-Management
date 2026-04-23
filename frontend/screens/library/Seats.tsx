import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useAppStore } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Seat management (Library role)
 *
 * Multi-tenant flow:
 * - Backend enforces { libraryId } via auth token
 * - Frontend uses authenticated API client (Axios interceptor attaches Bearer token)
 * - We only render seats for the current tenant
 */

export default function LibrarySeatsScreen() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const seats = useAppStore((s) => s.seats);
  const users = useAppStore((s) => s.users);
  const fetchStudents = useAppStore((s) => s.fetchStudents);
  const fetchSeats = useAppStore((s) => s.fetchSeats);
  const assignSeat = useAppStore((s) => s.assignSeat);
  const unassignSeat = useAppStore((s) => s.unassignSeat);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeSeatId, setActiveSeatId] = useState<string | null>(null);

  useEffect(() => {
    // Load all data needed to assign (students + seats)
    fetchStudents();
    fetchSeats();
  }, [fetchStudents, fetchSeats]);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || s.mobile.includes(q));
  }, [students, search]);

  const seatById = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);

  // 8x8 default, but dynamic: if backend returns more, we expand automatically.
  const maxSeatNumber = Math.max(64, ...seats.map((s) => s.number));
  const gridSeats = useMemo(() => {
    const byNumber = new Map(seats.map((s) => [s.number, s]));
    const arr = [];
    for (let n = 1; n <= maxSeatNumber; n++) {
      arr.push(byNumber.get(n) ?? { id: `virtual-${n}`, number: n, status: 'available', studentId: null, libraryId: null });
    }
    return arr;
  }, [seats, maxSeatNumber]);

  const { width } = Dimensions.get('window');
  const numColumns = Math.max(4, Math.min(8, Math.floor((width - theme.spacing.lg * 2) / 44)));

  const onSeatPress = (seatId: string) => {
    const seat = seatById.get(seatId);
    if (!seat) {
      Alert.alert('Seat not found', 'This seat does not exist on the server yet.');
      return;
    }
    if (seat.status === 'occupied') {
      Alert.alert('Seat occupied', 'Do you want to unassign this seat?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unassign',
          style: 'destructive',
          onPress: async () => {
            const res = await unassignSeat(seat.id);
            if (!res.ok) Alert.alert('Error', res.message || 'Failed to unassign seat');
          },
        },
      ]);
      return;
    }

    setActiveSeatId(seatId);
    setSearch('');
    setPickerOpen(true);
  };

  const onSelectStudent = async (studentId: string) => {
    if (!activeSeatId) return;
    const res = await assignSeat(activeSeatId, studentId);
    if (!res.ok) {
      Alert.alert('Error', res.message || 'Failed to assign seat');
      return;
    }
    setPickerOpen(false);
    setActiveSeatId(null);
  };

  const renderSeat = ({ item }: { item: any }) => {
    const real = String(item.id).startsWith('virtual-') ? null : item;
    const status = real?.status ?? 'available';
    const bg = status === 'occupied' ? 'rgba(239,68,68,0.16)' : 'rgba(34,197,94,0.16)';
    const border = status === 'occupied' ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)';
    const txt = status === 'occupied' ? theme.colors.danger : theme.colors.success;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => (real ? onSeatPress(real.id) : Alert.alert('Not created', 'Create seats on backend (POST /api/seats) before assigning.'))}
        style={[styles.seat, { backgroundColor: bg, borderColor: border }]}
      >
        <Text style={[styles.seatNo, { color: txt }]}>{item.number}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Seats</Text>
        <TouchableOpacity onPress={() => fetchSeats()} style={styles.refreshBtn} activeOpacity={0.9} accessibilityLabel="Refresh seats">
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={gridSeats}
        keyExtractor={(i) => String(i.id)}
        numColumns={numColumns}
        renderItem={renderSeat}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Assign student</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={theme.colors.mutedText} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search name / username / mobile"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={filteredStudents}
              keyExtractor={(s) => s.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.studentRow} onPress={() => onSelectStudent(item.id)} activeOpacity={0.9}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.studentName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.studentSub} numberOfLines={1}>@{item.username} · {item.mobile}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', color: theme.colors.mutedText }}>No students found</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3 },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  row: { gap: 8, justifyContent: 'flex-start' },
  seat: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  seatNo: { fontSize: 12, fontWeight: '900' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    ...theme.shadow.card,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text, paddingVertical: 10 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  avatarTxt: { fontSize: 14, fontWeight: '900', color: '#3730A3' },
  studentName: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  studentSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
});
}

