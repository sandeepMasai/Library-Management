import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../theme';
import { useAppStore, type SeatAllocation } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Seat + Shift Management (Library)
 *
 * Design notes:
 * - Seats are physical assets; occupancy is computed per shift via SeatAllocation.
 * - This enables Morning(100) + Evening(100) capacity using the same 100 seats.
 * - Backend enforces constraints:
 *   - seatId+shiftId unique (active)
 *   - studentId unique (active) => 1 student = 1 active allocation
 */
export default function LibrarySeatsScreen() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);

  const seats = useAppStore((s) => s.seats);
  const spaces = useAppStore((s) => s.spaces);
  const shifts = useAppStore((s) => s.shifts);
  const allocations = useAppStore((s) => s.allocations);
  const users = useAppStore((s) => s.users);

  const fetchStudents = useAppStore((s) => s.fetchStudents);
  const fetchSeats = useAppStore((s) => s.fetchSeats);
  const fetchSpaces = useAppStore((s) => s.fetchSpaces);
  const fetchShifts = useAppStore((s) => s.fetchShifts);
  const fetchAllocations = useAppStore((s) => s.fetchAllocations);
  const bulkCreateSeats = useAppStore((s) => s.bulkCreateSeats);
  const assignAllocation = useAppStore((s) => s.assignAllocation);
  const cancelAllocation = useAppStore((s) => s.cancelAllocation);
  const createSpace = useAppStore((s) => s.createSpace);
  const createShift = useAppStore((s) => s.createShift);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // UI state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'vacant' | 'occupied'>('all');
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null); // null => all spaces

  const [addSeatsOpen, setAddSeatsOpen] = useState(false);
  const [totalSeatsInput, setTotalSeatsInput] = useState('100');

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('06:00');
  const [shiftEnd, setShiftEnd] = useState('12:00');
  const [shiftType, setShiftType] = useState<'morning' | 'evening' | 'full_day' | 'half_day' | 'custom'>('custom');

  const [assignOpen, setAssignOpen] = useState(false);
  const [activeSeatId, setActiveSeatId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  });

  useEffect(() => {
    fetchStudents();
    fetchSeats();
    fetchSpaces();
    fetchShifts();
  }, [fetchStudents, fetchSeats, fetchSpaces, fetchShifts]);

  useEffect(() => {
    if (!selectedShiftId && shifts.length) setSelectedShiftId(shifts[0].id);
  }, [selectedShiftId, shifts]);

  useEffect(() => {
    if (selectedSpaceId === null && spaces.length === 0) return;
    if (selectedSpaceId === null) return;
    if (!selectedSpaceId && spaces.length) setSelectedSpaceId(spaces[0].id);
  }, [selectedSpaceId, spaces]);

  useEffect(() => {
    if (!selectedShiftId) return;
    fetchAllocations(selectedShiftId, selectedSpaceId || undefined);
  }, [selectedShiftId, selectedSpaceId, fetchAllocations]);

  const allocationBySeatId = useMemo(() => {
    const m = new Map<string, SeatAllocation>();
    for (const a of allocations) if (a.status === 'active') m.set(a.seatId, a);
    return m;
  }, [allocations]);

  const filteredSeats = useMemo(() => {
    const list = selectedSpaceId ? seats.filter((s) => (s.spaceId || null) === selectedSpaceId) : seats;
    const q = search.trim().toLowerCase();
    const withQuery = !q
      ? list
      : list.filter((seat) => {
          const alloc = allocationBySeatId.get(seat.id);
          const student = alloc ? studentById.get(alloc.studentId) : null;
          return (
            String(seat.number).includes(q) ||
            (student?.name || '').toLowerCase().includes(q) ||
            (student?.username || '').toLowerCase().includes(q) ||
            (student?.mobile || '').includes(q)
          );
        });

    if (statusFilter === 'all') return withQuery;
    return withQuery.filter((seat) => {
      const occupied = allocationBySeatId.has(seat.id);
      return statusFilter === 'occupied' ? occupied : !occupied;
    });
  }, [seats, selectedSpaceId, search, statusFilter, allocationBySeatId, studentById]);

  const stats = useMemo(() => {
    const inScope = selectedSpaceId ? seats.filter((s) => (s.spaceId || null) === selectedSpaceId) : seats;
    const total = inScope.length;
    const filled = inScope.reduce((acc, s) => acc + (allocationBySeatId.has(s.id) ? 1 : 0), 0);
    return { total, filled, vacant: total - filled, students: students.length };
  }, [seats, selectedSpaceId, allocationBySeatId, students.length]);

  const gridData = useMemo(() => [{ kind: 'add' as const }, ...filteredSeats.map((seat) => ({ kind: 'seat' as const, seat }))], [filteredSeats]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || s.mobile.includes(q));
  }, [students, studentSearch]);

  const onSeatPress = (seatId: string) => {
    const alloc = allocationBySeatId.get(seatId);
    if (!alloc) {
      if (!selectedShiftId) {
        Alert.alert('Shift required', 'Please create/select a shift first.');
        return;
      }
      setActiveSeatId(seatId);
      setStudentSearch('');
      setAssignOpen(true);
      return;
    }
    const student = studentById.get(alloc.studentId);
    Alert.alert('Occupied', `${student?.name || 'Student'} is assigned.\n\nUnassign this seat?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unassign',
        style: 'destructive',
        onPress: async () => {
          const res = await cancelAllocation(alloc.id);
          if (!res.ok) Alert.alert('Error', res.message || 'Failed to unassign');
          else if (selectedShiftId) fetchAllocations(selectedShiftId, selectedSpaceId || undefined);
        },
      },
    ]);
  };

  const onConfirmAssign = async (studentId: string) => {
    if (!activeSeatId || !selectedShiftId) return;
    if (endDate.getTime() <= startDate.getTime()) {
      Alert.alert('Invalid dates', 'End Date must be after Start Date.');
      return;
    }
    const res = await assignAllocation({
      seatId: activeSeatId,
      studentId,
      shiftId: selectedShiftId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    if (!res.ok) {
      Alert.alert('Error', res.message || 'Failed to assign');
      return;
    }
    setAssignOpen(false);
    setActiveSeatId(null);
    fetchAllocations(selectedShiftId, selectedSpaceId || undefined);
  };

  const renderItem = ({ item }: { item: any }) => {
    if (item.kind === 'add') {
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setAddSeatsOpen(true)} style={[styles.seatCard, styles.addSeatCard]}>
          <Ionicons name="add" size={22} color={theme.colors.mutedText} />
          <Text style={styles.addSeatTxt}>Add Seats</Text>
        </TouchableOpacity>
      );
    }

    const seat = item.seat;
    const alloc = allocationBySeatId.get(seat.id);
    const occupied = Boolean(alloc);
    const dot = occupied ? theme.colors.danger : theme.colors.success;
    const dotBg = occupied ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
    const student = alloc ? studentById.get(alloc.studentId) : null;

    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => onSeatPress(seat.id)} style={styles.seatCard}>
        <View style={styles.seatTop}>
          <Text style={styles.seatNo}>Seat {seat.number}</Text>
          <View style={[styles.dotWrap, { backgroundColor: dotBg, borderColor: dotBg }]}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
          </View>
        </View>
        <View style={styles.seatCenter}>
          {occupied ? (
            <Text style={styles.studentName} numberOfLines={2}>
              {student?.name || 'Student'}
            </Text>
          ) : (
            <View style={styles.plusWrap}>
              <Ionicons name="add" size={22} color={theme.colors.primary} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Space Grid</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setQuickAddOpen(true)} style={styles.iconBtn} activeOpacity={0.9} accessibilityLabel="Add">
            <Ionicons name="add" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              fetchSeats();
              fetchSpaces();
              fetchShifts();
              if (selectedShiftId) fetchAllocations(selectedShiftId, selectedSpaceId || undefined);
            }}
            style={styles.iconBtn}
            activeOpacity={0.9}
            accessibilityLabel="Refresh"
          >
            <Ionicons name="refresh" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.mutedText} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Find student or seat..." placeholderTextColor={theme.colors.mutedText} style={styles.searchInput} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{stats.total}</Text>
          <Text style={styles.statLab}>Total Seats</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{stats.filled}</Text>
          <Text style={styles.statLab}>Filled</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{stats.vacant}</Text>
          <Text style={styles.statLab}>Vacant</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{stats.students}</Text>
          <Text style={styles.statLab}>Students</Text>
        </View>
      </View>

      <View style={styles.selectorRow}>
        <FlatList
          horizontal
          data={shifts}
          keyExtractor={(i) => i.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: theme.spacing.lg }}
          renderItem={({ item }) => {
            const active = item.id === selectedShiftId;
            return (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedShiftId(item.id)} style={[styles.chip, active && styles.chipOn]}>
                <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{item.name}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>No shifts yet</Text>
            </View>
          }
        />
      </View>

      <View style={styles.selectorRow}>
        <FlatList
          horizontal
          data={[{ id: 'all', name: 'All Spaces' }, ...spaces.map((s) => ({ id: s.id, name: s.name }))]}
          keyExtractor={(i) => i.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: theme.spacing.lg }}
          renderItem={({ item }) => {
            const active = item.id === 'all' ? selectedSpaceId === null : item.id === selectedSpaceId;
            return (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setSelectedSpaceId(item.id === 'all' ? null : item.id)}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{item.name}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'vacant', 'occupied'] as const).map((k) => {
          const active = statusFilter === k;
          const label = k === 'all' ? 'All' : k === 'vacant' ? 'Vacant' : 'Occupied';
          return (
            <TouchableOpacity key={k} activeOpacity={0.9} onPress={() => setStatusFilter(k)} style={[styles.filterChip, active && styles.filterChipOn]}>
              <Text style={[styles.filterTxt, active && styles.filterTxtOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={gridData}
        keyExtractor={(i, idx) => (i.kind === 'add' ? 'add' : i.seat.id) + '-' + idx}
        numColumns={2}
        renderItem={renderItem}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      {/* Quick add modal (Seats/Space/Shift) */}
      <Modal visible={quickAddOpen} transparent animationType="fade" onRequestClose={() => setQuickAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Add</Text>
              <TouchableOpacity onPress={() => setQuickAddOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.quickRow}
              onPress={() => {
                setQuickAddOpen(false);
                setAddSeatsOpen(true);
              }}
            >
              <Ionicons name="grid-outline" size={18} color={theme.colors.text} />
              <Text style={styles.quickTxt}>Add Seats</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.quickRow}
              onPress={() => {
                setQuickAddOpen(false);
                setSpaceName('');
                setAddSpaceOpen(true);
              }}
            >
              <Ionicons name="business-outline" size={18} color={theme.colors.text} />
              <Text style={styles.quickTxt}>Add Space (Hall/Room)</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.quickRow, { borderBottomWidth: 0 }]}
              onPress={() => {
                setQuickAddOpen(false);
                setShiftName('');
                setShiftType('custom');
                setShiftStart('06:00');
                setShiftEnd('12:00');
                setAddShiftOpen(true);
              }}
            >
              <Ionicons name="time-outline" size={18} color={theme.colors.text} />
              <Text style={styles.quickTxt}>Add Shift</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={addSeatsOpen} transparent animationType="fade" onRequestClose={() => setAddSeatsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Add seats</Text>
              <TouchableOpacity onPress={() => setAddSeatsOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Enter total seats (creates 1..N, idempotent).</Text>
            <TextInput value={totalSeatsInput} onChangeText={setTotalSeatsInput} keyboardType="number-pad" placeholder="100" placeholderTextColor={theme.colors.mutedText} style={styles.modalInput} />
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.primaryBtn}
              onPress={async () => {
                const n = Number(totalSeatsInput);
                if (!Number.isInteger(n) || n < 1) return Alert.alert('Invalid', 'Total seats must be a positive integer.');
                const res = await bulkCreateSeats(n, selectedSpaceId);
                if (!res.ok) Alert.alert('Error', res.message || 'Failed to create seats');
                else setAddSeatsOpen(false);
              }}
            >
              <Text style={styles.primaryBtnTxt}>Create seats</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add space modal */}
      <Modal visible={addSpaceOpen} transparent animationType="fade" onRequestClose={() => setAddSpaceOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Add space</Text>
              <TouchableOpacity onPress={() => setAddSpaceOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Example: Main Hall, Room A</Text>
            <TextInput value={spaceName} onChangeText={setSpaceName} placeholder="Space name" placeholderTextColor={theme.colors.mutedText} style={styles.modalInput} />
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.primaryBtn}
              onPress={async () => {
                const name = spaceName.trim();
                if (!name) return Alert.alert('Invalid', 'Space name is required.');
                const res = await createSpace(name);
                if (!res.ok) return Alert.alert('Error', res.message || 'Failed to create space');
                await fetchSpaces();
                setAddSpaceOpen(false);
              }}
            >
              <Text style={styles.primaryBtnTxt}>Create space</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add shift modal */}
      <Modal visible={addShiftOpen} transparent animationType="fade" onRequestClose={() => setAddShiftOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Add shift</Text>
              <TouchableOpacity onPress={() => setAddShiftOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <TextInput value={shiftName} onChangeText={setShiftName} placeholder="Shift name (Morning)" placeholderTextColor={theme.colors.mutedText} style={styles.modalInput} />

            <View style={styles.shiftTypeRow}>
              {([
                { k: 'morning', t: 'Morning' },
                { k: 'evening', t: 'Evening' },
                { k: 'full_day', t: 'Full Day' },
                { k: 'half_day', t: 'Half Day' },
                { k: 'custom', t: 'Custom' },
              ] as const).map((x) => {
                const active = shiftType === x.k;
                return (
                  <TouchableOpacity key={x.k} activeOpacity={0.9} onPress={() => setShiftType(x.k)} style={[styles.smallChip, active && styles.smallChipOn]}>
                    <Text style={[styles.smallChipTxt, active && styles.smallChipTxtOn]}>{x.t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.shiftTimeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Start (HH:mm)</Text>
                <TextInput value={shiftStart} onChangeText={setShiftStart} placeholder="06:00" placeholderTextColor={theme.colors.mutedText} style={styles.modalInput} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>End (HH:mm)</Text>
                <TextInput value={shiftEnd} onChangeText={setShiftEnd} placeholder="12:00" placeholderTextColor={theme.colors.mutedText} style={styles.modalInput} />
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.primaryBtn}
              onPress={async () => {
                const name = shiftName.trim();
                if (!name) return Alert.alert('Invalid', 'Shift name is required.');
                const res = await createShift({ name, type: shiftType, startTime: shiftStart, endTime: shiftEnd });
                if (!res.ok) return Alert.alert('Error', res.message || 'Failed to create shift');
                await fetchShifts();
                setAddShiftOpen(false);
              }}
            >
              <Text style={styles.primaryBtnTxt}>Create shift</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.primaryBtn, { marginTop: 10, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }]}
              onPress={async () => {
                // Quick defaults
                const defaults = [
                  { name: 'Morning', type: 'morning' as const, startTime: '06:00', endTime: '12:00' },
                  { name: 'Evening', type: 'evening' as const, startTime: '14:00', endTime: '20:00' },
                  { name: 'Full Day', type: 'full_day' as const, startTime: '06:00', endTime: '20:00' },
                  { name: 'Half Day', type: 'half_day' as const, startTime: '16:00', endTime: '20:00' },
                ];
                for (const d of defaults) {
                  // eslint-disable-next-line no-await-in-loop
                  await createShift(d);
                }
                await fetchShifts();
                setAddShiftOpen(false);
              }}
            >
              <Text style={[styles.primaryBtnTxt, { color: theme.colors.text }]}>Create default shifts</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={assignOpen} transparent animationType="fade" onRequestClose={() => setAssignOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Assign seat</Text>
              <TouchableOpacity onPress={() => setAssignOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </TouchableOpacity>
            </View>

            <View style={styles.dateRow}>
              <TouchableOpacity activeOpacity={0.9} style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.mutedText} />
                <Text style={styles.dateTxt}>Start: {startDate.toISOString().slice(0, 10)}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.9} style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.mutedText} />
                <Text style={styles.dateTxt}>End: {endDate.toISOString().slice(0, 10)}</Text>
              </TouchableOpacity>
            </View>

            {showStartPicker ? (
              <DateTimePicker value={startDate} mode="date" onChange={(_e, d) => { setShowStartPicker(false); if (d) setStartDate(d); }} />
            ) : null}
            {showEndPicker ? (
              <DateTimePicker value={endDate} mode="date" onChange={(_e, d) => { setShowEndPicker(false); if (d) setEndDate(d); }} />
            ) : null}

            <View style={styles.studentSearchWrap}>
              <Ionicons name="search" size={18} color={theme.colors.mutedText} />
              <TextInput value={studentSearch} onChangeText={setStudentSearch} placeholder="Search student..." placeholderTextColor={theme.colors.mutedText} style={styles.searchInput} />
            </View>

            <FlatList
              data={filteredStudents}
              keyExtractor={(s) => s.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.studentRow} onPress={() => onConfirmAssign(item.id)} activeOpacity={0.9}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.studentRowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.studentSub} numberOfLines={1}>@{item.username} · {item.mobile}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
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
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchWrap: {
      marginHorizontal: theme.spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      minHeight: 46,
    },
    searchInput: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, paddingVertical: 10 },
    statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: theme.spacing.lg, marginTop: 12 },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      padding: 12,
      ...theme.shadow.card,
    },
    statVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
    statLab: { marginTop: 3, fontSize: 11, fontWeight: '800', color: theme.colors.mutedText },
    selectorRow: { marginTop: 12 },
    chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    chipTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
    chipTxtOn: { color: theme.colors.surface },
    filterRow: { flexDirection: 'row', gap: 10, paddingHorizontal: theme.spacing.lg, marginTop: 12 },
    filterChip: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
    filterChipOn: { backgroundColor: 'rgba(13,148,136,0.14)', borderColor: 'rgba(13,148,136,0.30)' },
    filterTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
    filterTxtOn: { color: theme.colors.primary },
    grid: { paddingHorizontal: theme.spacing.lg, paddingBottom: 120, paddingTop: 14 },
    gridRow: { gap: 12 },
    seatCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      padding: 12,
      marginBottom: 12,
      minHeight: 110,
      ...theme.shadow.card,
    },
    addSeatCard: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
    addSeatTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText },
    seatTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    seatNo: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
    dotWrap: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4 },
    seatCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
    plusWrap: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(13,148,136,0.10)', borderWidth: 1, borderColor: 'rgba(13,148,136,0.18)', alignItems: 'center', justifyContent: 'center' },
    studentName: { fontSize: 13, fontWeight: '900', color: theme.colors.text, textAlign: 'center' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
    modalCard: { width: '100%', maxWidth: 560, backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14, ...theme.shadow.card },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
    modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
    modalHint: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
    modalInput: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 12, minHeight: 46, fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
    primaryBtn: { backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
    primaryBtnTxt: { fontSize: 13, fontWeight: '900', color: theme.colors.surface },
    quickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      borderRadius: 14,
    },
    quickTxt: { flex: 1, fontSize: 13, fontWeight: '900', color: theme.colors.text },

    dateRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
    dateTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
    inputLabel: { marginBottom: 6, fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
    shiftTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    smallChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border },
    smallChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    smallChipTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
    smallChipTxtOn: { color: theme.colors.surface },
    shiftTimeRow: { flexDirection: 'row', gap: 10 },
    studentSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 12, minHeight: 46, marginBottom: 10 },
    studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    avatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.14)', alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 14, fontWeight: '900', color: theme.colors.primary },
    studentRowName: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
    studentSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
  });
}

