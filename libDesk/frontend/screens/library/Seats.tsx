import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../theme';
import { useAppStore, type SeatAllocation } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { ErrorModal } from '../../components/ErrorModal';
import { ConfirmModal } from '../../components/ConfirmModal';

function withAlpha(color: string, alpha: number) {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const { width } = useWindowDimensions();

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
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorTitle, setErrorTitle] = useState('Something went wrong');
  const [errorMessage, setErrorMessage] = useState('');
  const [occupiedPrompt, setOccupiedPrompt] = useState<{
    allocationId: string;
    studentName: string;
  } | null>(null);
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

  const gridColumns = width >= 720 ? 4 : 3;
  const gridGap = 10;
  const gridPadding = theme.spacing.lg;
  const seatCardWidth = Math.floor((width - gridPadding * 2 - gridGap * (gridColumns - 1)) / gridColumns);

  const gridData = useMemo(() => [{ kind: 'add' as const }, ...filteredSeats.map((seat) => ({ kind: 'seat' as const, seat }))], [filteredSeats]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || s.mobile.includes(q));
  }, [students, studentSearch]);

  const showError = (title: string, message: string) => {
    setErrorTitle(title);
    setErrorMessage(message);
    setShowErrorModal(true);
  };

  const onSeatPress = (seatId: string) => {
    const alloc = allocationBySeatId.get(seatId);
    if (!alloc) {
      if (!selectedShiftId) {
        showError('Shift required', 'Please create or select a shift before assigning a seat.');
        return;
      }
      if (activeSeatId === seatId) {
        setActiveSeatId(null);
        return;
      }
      setActiveSeatId(seatId);
      setStudentSearch('');
      setAssignOpen(true);
      return;
    }
    const student = studentById.get(alloc.studentId);
    setOccupiedPrompt({
      allocationId: alloc.id,
      studentName: student?.name || 'Student',
    });
  };

  const onConfirmAssign = async (studentId: string) => {
    if (!activeSeatId || !selectedShiftId) return;
    if (endDate.getTime() <= startDate.getTime()) {
      showError('Invalid dates', 'End Date must be after Start Date.');
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
      showError('Assignment failed', res.message || 'Failed to assign this seat. Please try again.');
      return;
    }
    setAssignOpen(false);
    setActiveSeatId(null);
    fetchAllocations(selectedShiftId, selectedSpaceId || undefined);
  };

  const renderItem = ({ item }: { item: any }) => {
    if (item.kind === 'add') {
      return (
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => setAddSeatsOpen(true)}
          style={[styles.seatCard, styles.addSeatCard, { width: seatCardWidth }]}
        >
          <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
          <Text style={styles.addSeatTxt}>Add Seats</Text>
        </TouchableOpacity>
      );
    }

    const seat = item.seat;
    const alloc = allocationBySeatId.get(seat.id);
    const occupied = Boolean(alloc);
    const selected = activeSeatId === seat.id;
    const student = alloc ? studentById.get(alloc.studentId) : null;
    const stateLabel = occupied ? 'Booked' : selected ? 'Selected' : 'Available';
    const stateIcon = occupied ? 'lock-closed' : selected ? 'checkmark-circle' : 'ellipse-outline';

    return (
      <TouchableOpacity
        activeOpacity={0.78}
        onPress={() => onSeatPress(seat.id)}
        style={[
          styles.seatCard,
          { width: seatCardWidth },
          occupied && styles.seatCardBooked,
          selected && !occupied && styles.seatCardSelected,
        ]}
      >
        <View style={styles.seatTop}>
          <Text style={[styles.seatNo, selected && !occupied && styles.seatNoSelected]}>#{seat.number}</Text>
          <View style={[styles.stateBadge, occupied && styles.stateBadgeBooked, selected && !occupied && styles.stateBadgeSelected]}>
            <Ionicons
              name={stateIcon as keyof typeof Ionicons.glyphMap}
              size={11}
              color={occupied ? theme.colors.danger : selected ? theme.colors.surface : theme.colors.success}
            />
          </View>
        </View>
        <View style={styles.seatCenter}>
          {occupied ? (
            <Text style={styles.studentName} numberOfLines={2}>
              {student?.name || 'Student'}
            </Text>
          ) : (
            <View style={[styles.seatIconWrap, selected && styles.seatIconWrapSelected]}>
              <Ionicons name={selected ? 'checkmark' : 'add'} size={20} color={selected ? theme.colors.primary : theme.colors.primary} />
            </View>
          )}
        </View>
        <Text style={[styles.seatStateTxt, selected && !occupied && styles.seatStateTxtSelected]}>{stateLabel}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SEAT MAP</Text>
          <Text style={styles.title}>Select Seats</Text>
        </View>
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

      <View style={styles.legendRow}>
        <LegendDot color={theme.colors.success} label="Available" />
        <LegendDot color={theme.colors.primary} label="Selected" />
        <LegendDot color={theme.colors.danger} label="Booked" />
      </View>

      <FlatList
        data={gridData}
        keyExtractor={(i, idx) => (i.kind === 'add' ? 'add' : i.seat.id) + '-' + idx}
        key={`seat-grid-${gridColumns}`}
        numColumns={gridColumns}
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
                if (!Number.isInteger(n) || n < 1) {
                  showError('Invalid seat count', 'Total seats must be a positive integer.');
                  return;
                }
                const res = await bulkCreateSeats(n, selectedSpaceId);
                if (!res.ok) showError('Could not create seats', res.message || 'Failed to create seats.');
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
                if (!name) {
                  showError('Space name required', 'Please enter a space name.');
                  return;
                }
                const res = await createSpace(name);
                if (!res.ok) {
                  showError('Could not create space', res.message || 'Failed to create space.');
                  return;
                }
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
                if (!name) {
                  showError('Shift name required', 'Please enter a shift name.');
                  return;
                }
                const res = await createShift({ name, type: shiftType, startTime: shiftStart, endTime: shiftEnd });
                if (!res.ok) {
                  showError('Could not create shift', res.message || 'Failed to create shift.');
                  return;
                }
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

      <Modal
        visible={assignOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAssignOpen(false);
          setActiveSeatId(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Assign seat</Text>
              <TouchableOpacity
                onPress={() => {
                  setAssignOpen(false);
                  setActiveSeatId(null);
                }}
                hitSlop={12}
              >
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

      <ConfirmModal
        visible={!!occupiedPrompt}
        tone="danger"
        label="BOOKED SEAT"
        title="Seat already booked"
        description={
          occupiedPrompt
            ? `${occupiedPrompt.studentName} is assigned to this seat. Do you want to unassign it?`
            : undefined
        }
        cancelText="Cancel"
        confirmText="Unassign"
        confirmIcon="lock-open-outline"
        onCancel={() => setOccupiedPrompt(null)}
        onConfirm={async () => {
          if (!occupiedPrompt) return;
          const prompt = occupiedPrompt;
          setOccupiedPrompt(null);
          const res = await cancelAllocation(prompt.allocationId);
          if (!res.ok) {
            showError('Unassign failed', res.message || 'Failed to unassign this seat. Please try again.');
            return;
          }
          if (selectedShiftId) fetchAllocations(selectedShiftId, selectedSpaceId || undefined);
        }}
      />

      <ErrorModal
        visible={showErrorModal}
        title={errorTitle}
        message={errorMessage}
        icon="warning"
        buttonText="OK"
        onClose={() => setShowErrorModal(false)}
      />
    </SafeAreaView>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={legendStyles.item}>
      <View style={[legendStyles.dot, { backgroundColor: color }]} />
      <Text style={[legendStyles.text, { color: theme.colors.mutedText }]}>{label}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  text: { fontSize: 11, fontWeight: '800' },
});

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: 4,
      paddingBottom: theme.spacing.sm,
    },
    kicker: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 1.4 },
    title: { marginTop: 2, fontSize: 24, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
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
    filterChipOn: { backgroundColor: withAlpha(theme.colors.primary, 0.14), borderColor: withAlpha(theme.colors.primary, 0.30) },
    filterTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
    filterTxtOn: { color: theme.colors.primary },
    legendRow: {
      marginHorizontal: theme.spacing.lg,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    grid: { paddingHorizontal: theme.spacing.lg, paddingBottom: 120, paddingTop: 12 },
    gridRow: { gap: 10 },
    seatCard: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1.2,
      borderColor: theme.colors.border,
      borderRadius: 16,
      padding: 10,
      marginBottom: 10,
      minHeight: 104,
      ...theme.shadow.card,
    },
    seatCardSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      shadowOpacity: 0.16,
      elevation: 7,
    },
    seatCardBooked: {
      backgroundColor: withAlpha(theme.colors.danger, 0.08),
      borderColor: withAlpha(theme.colors.danger, 0.26),
      opacity: 0.78,
    },
    addSeatCard: {
      borderStyle: 'dashed',
      borderColor: withAlpha(theme.colors.primary, 0.35),
      backgroundColor: withAlpha(theme.colors.primary, 0.06),
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    addSeatTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.primary },
    seatTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    seatNo: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
    seatNoSelected: { color: theme.colors.surface },
    stateBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: withAlpha(theme.colors.success, 0.22),
      backgroundColor: withAlpha(theme.colors.success, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateBadgeSelected: {
      borderColor: withAlpha(theme.colors.surface, 0.28),
      backgroundColor: withAlpha(theme.colors.surface, 0.18),
    },
    stateBadgeBooked: {
      borderColor: withAlpha(theme.colors.danger, 0.26),
      backgroundColor: withAlpha(theme.colors.danger, 0.12),
    },
    seatCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
    seatIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.colors.primary, 0.10),
      borderWidth: 1,
      borderColor: withAlpha(theme.colors.primary, 0.18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    seatIconWrapSelected: {
      backgroundColor: theme.colors.surface,
      borderColor: withAlpha(theme.colors.surface, 0.8),
    },
    seatStateTxt: { fontSize: 10, fontWeight: '900', color: theme.colors.mutedText, textAlign: 'center' },
    seatStateTxtSelected: { color: theme.colors.surface },
    studentName: { fontSize: 12, fontWeight: '900', color: theme.colors.danger, textAlign: 'center' },
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

