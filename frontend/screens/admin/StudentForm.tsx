import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useAppStore, FeeMethod, FeeStatus, type Seat } from '../../store';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInDays, format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmModal, type ConfirmTone } from '../../components/ConfirmModal';

export default function AdminStudentForm() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const studentId = route.params?.studentId;

  const users = useAppStore((state) => state.users);
  const role = useAppStore((state) => state.role);
  const fetchStudents = useAppStore((state) => state.fetchStudents);
  const addStudent = useAppStore((state) => state.addStudent);
  const updateStudent = useAppStore((state) => state.updateStudent);
  const uploadStudentPhoto = useAppStore((state) => state.uploadStudentPhoto);

  // Seat allocation (library flow)
  const seats = useAppStore((s) => s.seats);
  const shifts = useAppStore((s) => s.shifts);
  const allocations = useAppStore((s) => s.allocations);
  const fetchSeats = useAppStore((s) => s.fetchSeats);
  const fetchShifts = useAppStore((s) => s.fetchShifts);
  const fetchAllocations = useAppStore((s) => s.fetchAllocations);
  const assignAllocation = useAppStore((s) => s.assignAllocation);

  const isEditing = !!studentId;
  const existingStudent = isEditing ? users.find((u) => u.id === studentId) : null;

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    mobile: '',
    pin: '',
    joinDate: new Date().toISOString().slice(0, 10),
    membershipDays: 30 as 30 | 90 | 180 | 365,
    feeAmount: '',
    feeStatus: 'Paid' as FeeStatus,
    feeMethod: 'cash' as FeeMethod,
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; description?: string; tone?: ConfirmTone } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description?: string;
    tone: ConfirmTone;
    confirmText: string;
    confirmIcon?: keyof typeof Ionicons.glyphMap;
    loading?: boolean;
  } | null>(null);
  const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);

  const isLibrary = role === 'library';
  const [allocEnabled, setAllocEnabled] = useState(true);
  const [allocShiftId, setAllocShiftId] = useState<string | null>(null);
  const [allocSeatId, setAllocSeatId] = useState<string | null>(null);
  const [allocStartDate, setAllocStartDate] = useState<Date>(new Date());
  const [allocEndDate, setAllocEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  });
  const [showAllocStartPicker, setShowAllocStartPicker] = useState(false);
  const [showAllocEndPicker, setShowAllocEndPicker] = useState(false);
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);

  const shiftTone = (t: string) => {
    // Requested colors:
    // Morning → yellow, Evening → blue, Full Day → green, Half Day → orange
    if (t === 'morning') return { fg: '#A16207', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.30)' }; // yellow
    if (t === 'evening') return { fg: '#1D4ED8', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.30)' }; // blue
    if (t === 'full_day') return { fg: '#15803D', bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.30)' }; // green
    if (t === 'half_day') return { fg: '#C2410C', bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.30)' }; // orange
    return { fg: theme.colors.primary, bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.22)' }; // custom
  };

  useEffect(() => {
    if (existingStudent) {
      setFormData({
        name: existingStudent.name,
        username: existingStudent.username,
        mobile: existingStudent.mobile,
        // Do not expose PIN after creation (backend never returns it).
        pin: '',
        joinDate: existingStudent.joinDate.slice(0, 10),
        membershipDays: 30,
        feeAmount: existingStudent.feeAmount.toString(),
        feeStatus: existingStudent.feeStatus,
        feeMethod: (existingStudent.feeMethod as FeeMethod) || 'cash',
      });
    }
  }, [existingStudent]);

  // Load allocation data when adding student in library flow
  useEffect(() => {
    if (!isLibrary) return;
    if (isEditing) return;
    fetchSeats();
    fetchShifts();
  }, [isLibrary, isEditing, fetchSeats, fetchShifts]);

  useEffect(() => {
    if (!isLibrary) return;
    if (isEditing) return;
    if (!allocShiftId && shifts.length) setAllocShiftId(shifts[0].id);
  }, [isLibrary, isEditing, allocShiftId, shifts]);

  useEffect(() => {
    if (!isLibrary) return;
    if (isEditing) return;
    if (!allocShiftId) return;
    fetchAllocations(allocShiftId);
  }, [isLibrary, isEditing, allocShiftId, fetchAllocations]);

  const occupiedSeatIds = useMemo(() => {
    if (!allocShiftId) return new Set<string>();
    return new Set(allocations.filter((a) => a.status === 'active' && a.shiftId === allocShiftId).map((a) => a.seatId));
  }, [allocations, allocShiftId]);

  const vacantSeats = useMemo<Seat[]>(() => {
    return seats
      .slice()
      .sort((a, b) => a.number - b.number)
      .filter((s) => !occupiedSeatIds.has(s.id));
  }, [seats, occupiedSeatIds]);

  const selectedSeatNumber = useMemo(() => {
    if (!allocSeatId) return null;
    return seats.find((s) => s.id === allocSeatId)?.number ?? null;
  }, [allocSeatId, seats]);

  const membershipMeta = useMemo(() => {
    if (!existingStudent) return null;
    const days = differenceInDays(new Date(existingStudent.expiryDate), new Date());
    const expired = days < 0;
    return {
      expiryLabel: format(new Date(existingStudent.expiryDate), 'dd MMM yyyy'),
      daysLeft: days,
      expired,
      blocked: existingStudent.isBlocked,
    };
  }, [existingStudent]);

  const handleSave = async () => {
    // Multi-tenant backend requires authenticated requests (token attached globally via Axios).
    if (!formData.name || !formData.username || !formData.mobile || !formData.feeAmount || !formData.joinDate) {
      setInfoModal({ title: 'Missing fields', description: 'Please fill all fields.', tone: 'neutral' });
      return;
    }

    // PIN rules:
    // - required on create
    // - optional on edit (only updates if provided)
    if (!isEditing && !formData.pin.trim()) {
      setInfoModal({ title: 'Missing PIN', description: 'Please set a 4-digit PIN for the student.', tone: 'neutral' });
      return;
    }
    if (formData.pin.trim() && !/^\d{4}$/.test(formData.pin.trim())) {
      setInfoModal({ title: 'Invalid PIN', description: 'PIN must be exactly 4 digits.', tone: 'neutral' });
      return;
    }

    // Use current timestamp if join date is today (avoids UTC-midnight timezone offset)
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isJoinToday = formData.joinDate === todayStr;
    const parsedJoinDate = isJoinToday ? new Date() : new Date(formData.joinDate + 'T12:00:00');
    if (Number.isNaN(parsedJoinDate.getTime())) {
      setInfoModal({ title: 'Invalid date', description: 'Joining date is invalid.', tone: 'neutral' });
      return;
    }

    const feeNum = Number(formData.feeAmount);
    if (Number.isNaN(feeNum) || feeNum < 0) {
      setInfoModal({ title: 'Invalid fee', description: 'Enter a valid fee amount.', tone: 'neutral' });
      return;
    }

    const payload = {
      name: formData.name.trim(),
      username: formData.username.trim(),
      mobile: formData.mobile.trim(),
      ...(formData.pin.trim() ? { pin: formData.pin.trim() } : {}),
      joinDate: parsedJoinDate.toISOString(),
      membershipDays: formData.membershipDays,
      feeAmount: feeNum,
      feeStatus: formData.feeStatus,
      feeMethod: formData.feeMethod,
    };

    confirmActionRef.current = async () => {
      setConfirmModal((c) => (c ? { ...c, loading: true } : c));

      let result: { ok: boolean; message?: string };
      if (isEditing) {
        result = await updateStudent(studentId, payload);
      } else {
        result = await addStudent({ ...payload, isBlocked: false });
      }

      if (!result.ok) {
        const msg = result.message || 'Something went wrong.';
        setConfirmModal(null);
        // Duplicate username/mobile handling (backend returns 409 with a clean message)
        if (msg.toLowerCase().includes('already exists')) {
          setInfoModal({ title: 'Duplicate', description: msg, tone: 'danger' });
        } else {
          setInfoModal({ title: 'Could not save', description: msg, tone: 'danger' });
        }
        return;
      }

      await fetchStudents();

      // Optional: allocate seat+shift immediately for library flow
      if (!isEditing && isLibrary && allocEnabled) {
        const createdId = (result as { ok: boolean; student?: { id: string } }).student?.id;
        if (createdId && allocShiftId && allocSeatId) {
          if (allocEndDate.getTime() <= allocStartDate.getTime()) {
            setInfoModal({
              title: 'Allocation skipped',
              description: 'Allocation dates are invalid. Student created successfully.',
              tone: 'neutral',
            });
          } else {
            const allocRes = await assignAllocation({
              seatId: allocSeatId,
              studentId: createdId,
              shiftId: allocShiftId,
              startDate: allocStartDate.toISOString(),
              endDate: allocEndDate.toISOString(),
            });
            if (!allocRes.ok) {
              setInfoModal({
                title: 'Seat allocation failed',
                description:
                  allocRes.message ||
                  'Student created, but seat allocation failed. You can allocate later from Seats.',
                tone: 'danger',
              });
            }
          }
        }
      }

      if (pendingPhotoUri) {
        const savedId = isEditing ? studentId : (result as { ok: boolean; student?: { id: string } }).student?.id;
        if (savedId) {
          setUploadingPhoto(true);
          const photoResult = await uploadStudentPhoto(savedId, pendingPhotoUri);
          setUploadingPhoto(false);
          if (!photoResult.ok) {
            setInfoModal({
              title: 'Photo upload failed',
              description:
                photoResult.message ||
                'Could not upload photo. You can try again by editing the student.',
              tone: 'danger',
            });
          }
        }
      }

      setConfirmModal(null);
      navigation.goBack();
    };

    setConfirmModal({
      tone: 'primary',
      title: isEditing ? 'Save Changes?' : 'Create Student?',
      description: isEditing
        ? `Are you sure you want to update details for ${formData.name.trim()}?`
        : `Create a new student account for ${formData.name.trim()}?`,
      confirmText: isEditing ? 'Save' : 'Create',
      confirmIcon: isEditing ? 'save-outline' : 'person-add-outline',
      loading: false,
    });
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setInfoModal({ title: 'Permission required', description: 'Please allow access to your photo library.', tone: 'neutral' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPendingPhotoUri(result.assets[0].uri);
    }
  };

  const feeOptions: FeeStatus[] = ['Paid', 'Half Paid', 'Pending'];

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {/* Top summary */}
          {isEditing && existingStudent ? (
            <View style={styles.hero}>
              <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8} style={styles.heroAvatarWrap}>
                {pendingPhotoUri || existingStudent.photoUrl ? (
                  <Image
                    source={{ uri: pendingPhotoUri ?? existingStudent.photoUrl ?? undefined }}
                    style={styles.heroAvatarImg}
                  />
                ) : (
                  <View style={styles.heroAvatar}>
                    <Text style={styles.heroAvatarText}>{existingStudent.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.heroAvatarEdit}>
                  {uploadingPhoto ? (
                    <ActivityIndicator size={12} color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={12} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.heroText}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {existingStudent.name}
                </Text>
                <Text style={styles.heroSub} numberOfLines={1}>
                  @{existingStudent.username} · {existingStudent.mobile}
                </Text>
                {membershipMeta && (
                  <View style={styles.heroChips}>
                    {membershipMeta.blocked && (
                      <View style={[styles.miniChip, styles.chipBad]}>
                        <Ionicons name="ban-outline" size={12} color={theme.colors.danger} />
                        <Text style={styles.miniChipText}>Blocked</Text>
                      </View>
                    )}
                    <View style={[styles.miniChip, membershipMeta.expired ? styles.chipWarn : styles.chipOk]}>
                      <Ionicons name="calendar-outline" size={12} color={membershipMeta.expired ? theme.colors.warning : theme.colors.success} />
                      <Text style={[styles.miniChipText, membershipMeta.expired && { color: theme.colors.warning }, !membershipMeta.expired && { color: theme.colors.success }]}>
                        {membershipMeta.expired ? 'Expired' : `${Math.max(0, membershipMeta.daysLeft)}d left`}
                      </Text>
                    </View>
                    <View style={styles.miniChipMuted}>
                      <Text style={styles.miniChipMutedText}>Until {membershipMeta.expiryLabel}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.newBanner}>
              <View style={styles.newIcon}>
                <Ionicons name="person-add-outline" size={26} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={styles.newTitle}>New student</Text>
                <Text style={styles.newSub}>Add membership and login details.</Text>
              </View>
            </View>
          )}

          {/* Account */}
          <Text style={styles.sectionKicker}>Account</Text>
          <View style={styles.card}>
            <Field styles={styles} label="Full name" icon="person-outline">
              <TextInput
                value={formData.name}
                onChangeText={(t) => setFormData({ ...formData, name: t })}
                placeholder="Full name"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
              />
            </Field>
            <Field styles={styles} label="Username" icon="person-circle-outline">
              <TextInput
                value={formData.username}
                onChangeText={(t) => setFormData({ ...formData, username: t })}
                placeholder="Username"
                placeholderTextColor={theme.colors.mutedText}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </Field>
            <Field styles={styles} label="Mobile" icon="call-outline">
              <TextInput
                value={formData.mobile}
                onChangeText={(t) => setFormData({ ...formData, mobile: t })}
                placeholder="Mobile number"
                placeholderTextColor={theme.colors.mutedText}
                keyboardType="phone-pad"
                style={styles.input}
              />
            </Field>
            <View style={[styles.fieldBlock, styles.fieldBlockLast]}>
              <Text style={styles.fieldLabel}>{isEditing ? 'Set new PIN (optional)' : 'Login PIN (4 digits)'}</Text>
              <View style={styles.inputShell}>
                <Ionicons name="key-outline" size={20} color={theme.colors.mutedText} style={styles.fieldIcon} />
                <TextInput
                  value={formData.pin}
                  onChangeText={(t) => setFormData({ ...formData, pin: t })}
                  placeholder={isEditing ? 'Leave blank to keep current PIN' : 'Enter 4-digit PIN'}
                  placeholderTextColor={theme.colors.mutedText}
                  secureTextEntry={!showPin}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.input}
                />
                <TouchableOpacity
                  onPress={() => setShowPin((s) => !s)}
                  style={styles.eyeBtn}
                  hitSlop={12}
                  accessibilityLabel={showPin ? 'Hide PIN' : 'Show PIN'}
                >
                  <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.colors.mutedText} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Membership */}
          <Text style={styles.sectionKicker}>Membership & fee</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Joining date</Text>
            <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker(true)} activeOpacity={0.85}>
              <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.dateValue}>{format(new Date(formData.joinDate + 'T12:00:00'), 'EEEE, d MMM yyyy')}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.mutedText} />
            </TouchableOpacity>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Membership duration</Text>
              <View style={styles.durationRow}>
                {[30, 90, 180, 365].map((d) => {
                  const active = formData.membershipDays === d;
                  const label = d === 30 ? '1 Month' : d === 90 ? '3 Months' : d === 180 ? '6 Months' : '1 Year';
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.durationChip, active && styles.durationChipOn]}
                      onPress={() => setFormData({ ...formData, membershipDays: d as any })}
                      activeOpacity={0.88}
                    >
                      <Text style={[styles.durationChipText, active && styles.durationChipTextOn]} numberOfLines={1}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {showDatePicker && Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.dateDone} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.dateDoneText}>Done</Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={new Date(formData.joinDate + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_event, selectedDate) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (selectedDate) {
                    setFormData({ ...formData, joinDate: format(selectedDate, 'yyyy-MM-dd') });
                  }
                }}
              />
            )}

            <View style={styles.divider} />

            <Field styles={styles} label="Fee amount (₹)" icon="cash-outline">
              <TextInput
                value={formData.feeAmount}
                onChangeText={(t) => setFormData({ ...formData, feeAmount: t })}
                placeholder="0"
                placeholderTextColor={theme.colors.mutedText}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </Field>

            <Text style={styles.fieldLabel}>Payment method</Text>
            <View style={styles.methodRow}>
              {(['cash', 'upi'] as FeeMethod[]).map((m) => {
                const active = formData.feeMethod === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodChip, active && styles.methodChipOn]}
                    onPress={() => setFormData({ ...formData, feeMethod: m })}
                    activeOpacity={0.88}
                  >
                    <Ionicons
                      name={m === 'cash' ? 'cash-outline' : 'qr-code-outline'}
                      size={16}
                      color={active ? theme.colors.primary : theme.colors.mutedText}
                    />
                    <Text style={[styles.methodChipText, active && styles.methodChipTextOn]} numberOfLines={1}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Fee status</Text>
            <View style={styles.feeRow}>
              {feeOptions.map((status) => {
                const active = formData.feeStatus === status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[styles.feeChip, active && styles.feeChipOn]}
                    onPress={() => setFormData({ ...formData, feeStatus: status })}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.feeChipText, active && styles.feeChipTextOn]} numberOfLines={1}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Seat allocation (library create flow) */}
            {!isEditing && isLibrary ? (
              <>
                <View style={styles.divider} />
                <View style={styles.allocHead}>
                  <Text style={styles.allocTitle}>Seat allocation</Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setAllocEnabled((v) => !v)}
                    style={[styles.allocToggle, allocEnabled && styles.allocToggleOn]}
                  >
                    <Text style={[styles.allocToggleTxt, allocEnabled && styles.allocToggleTxtOn]}>
                      {allocEnabled ? 'ON' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {allocEnabled ? (
                  <>
                    <Text style={styles.fieldLabel}>Shift</Text>
                    <View style={styles.shiftRow}>
                      {shifts.length ? (
                        shifts.map((s) => {
                          const active = s.id === allocShiftId;
                          const tone = shiftTone(s.type);
                          return (
                            <TouchableOpacity
                              key={s.id}
                              style={[
                                styles.shiftChip,
                                { backgroundColor: tone.bg, borderColor: tone.border },
                                active && styles.shiftChipOn,
                              ]}
                              onPress={() => {
                                setAllocShiftId(s.id);
                                setAllocSeatId(null);
                              }}
                              activeOpacity={0.88}
                            >
                              <Text
                                style={[
                                  styles.shiftChipText,
                                  { color: tone.fg },
                                  active && styles.shiftChipTextOn,
                                ]}
                                numberOfLines={1}
                              >
                                {s.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <View>
                          <Text style={{ color: theme.colors.mutedText, fontWeight: '700' }}>
                            No shifts found. Create shifts now:
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={async () => {
                              const defaults = [
                                { name: 'Morning', type: 'morning' as const, startTime: '06:00', endTime: '12:00' },
                                { name: 'Evening', type: 'evening' as const, startTime: '16:00', endTime: '20:00' },
                                { name: 'Full Day', type: 'full_day' as const, startTime: '06:00', endTime: '20:00' },
                                { name: 'Half Day', type: 'half_day' as const, startTime: '06:00', endTime: '10:00' },
                                { name: 'Custom', type: 'custom' as const, startTime: '09:00', endTime: '13:00' },
                              ];
                              for (const d of defaults) {
                                // eslint-disable-next-line no-await-in-loop
                                await useAppStore.getState().createShift(d as any);
                              }
                              await fetchShifts();
                            }}
                            style={[
                              styles.allocToggle,
                              { marginTop: 10, alignSelf: 'flex-start' },
                            ]}
                          >
                            <Text style={[styles.allocToggleTxt, { color: theme.colors.primary }]}>Create default shifts</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <Text style={styles.fieldLabel}>Seat number</Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.seatPickBtn}
                      onPress={() => {
                        if (!allocShiftId) {
                          setInfoModal({ title: 'Shift required', description: 'Select a shift first.', tone: 'neutral' });
                          return;
                        }
                        setSeatPickerOpen(true);
                      }}
                    >
                      <Ionicons name="apps-outline" size={18} color={theme.colors.mutedText} />
                      <Text style={styles.seatPickTxt}>
                        {selectedSeatNumber ? `Seat ${selectedSeatNumber}` : vacantSeats.length ? 'Select seat' : 'No vacant seats'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={theme.colors.mutedText} />
                    </TouchableOpacity>

                    <Text style={styles.fieldLabel}>Allocation dates</Text>
                    <View style={styles.allocDateRow}>
                      <TouchableOpacity activeOpacity={0.9} style={styles.allocDateBtn} onPress={() => setShowAllocStartPicker(true)}>
                        <Ionicons name="calendar-outline" size={16} color={theme.colors.mutedText} />
                        <Text style={styles.allocDateTxt}>Start: {format(allocStartDate, 'yyyy-MM-dd')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.9} style={styles.allocDateBtn} onPress={() => setShowAllocEndPicker(true)}>
                        <Ionicons name="calendar-outline" size={16} color={theme.colors.mutedText} />
                        <Text style={styles.allocDateTxt}>End: {format(allocEndDate, 'yyyy-MM-dd')}</Text>
                      </TouchableOpacity>
                    </View>

                    {showAllocStartPicker && (
                      <DateTimePicker
                        value={allocStartDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_event, selectedDate) => {
                          if (Platform.OS !== 'ios') setShowAllocStartPicker(false);
                          if (selectedDate) setAllocStartDate(selectedDate);
                        }}
                      />
                    )}
                    {showAllocEndPicker && (
                      <DateTimePicker
                        value={allocEndDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_event, selectedDate) => {
                          if (Platform.OS !== 'ios') setShowAllocEndPicker(false);
                          if (selectedDate) setAllocEndDate(selectedDate);
                        }}
                      />
                    )}

                    {(showAllocStartPicker || showAllocEndPicker) && Platform.OS === 'ios' ? (
                      <TouchableOpacity style={styles.dateDone} onPress={() => { setShowAllocStartPicker(false); setShowAllocEndPicker(false); }}>
                        <Text style={styles.dateDoneText}>Done</Text>
                      </TouchableOpacity>
                    ) : null}

                    <Modal visible={seatPickerOpen} transparent animationType="fade" onRequestClose={() => setSeatPickerOpen(false)}>
                      <View style={styles.modalBackdrop}>
                        <View style={styles.modalCard}>
                          <View style={styles.modalHead}>
                            <Text style={styles.modalTitle}>Select seat</Text>
                            <TouchableOpacity onPress={() => setSeatPickerOpen(false)} hitSlop={12}>
                              <Ionicons name="close" size={22} color={theme.colors.mutedText} />
                            </TouchableOpacity>
                          </View>
                          <FlatList
                            data={vacantSeats}
                            keyExtractor={(x: Seat) => x.id}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 10 }}
                            contentContainerStyle={{ paddingBottom: 6 }}
                            renderItem={({ item }: { item: Seat }) => (
                              <TouchableOpacity
                                activeOpacity={0.9}
                                style={[styles.seatMini, allocSeatId === item.id && styles.seatMiniOn]}
                                onPress={() => {
                                  setAllocSeatId(item.id);
                                  setSeatPickerOpen(false);
                                }}
                              >
                                <Text style={[styles.seatMiniTxt, allocSeatId === item.id && styles.seatMiniTxtOn]}>{item.number}</Text>
                              </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                                <Text style={{ fontWeight: '700', color: theme.colors.mutedText }}>No vacant seats</Text>
                              </View>
                            }
                          />
                        </View>
                      </View>
                    </Modal>
                  </>
                ) : null}
              </>
            ) : null}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.92}>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.saveBtnText}>{isEditing ? 'Save changes' : 'Create student'}</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={!!confirmModal}
        tone={confirmModal?.tone ?? 'neutral'}
        label="CONFIRM"
        title={confirmModal?.title ?? 'Confirm'}
        description={confirmModal?.description}
        loading={!!confirmModal?.loading}
        cancelText="Cancel"
        confirmText={confirmModal?.confirmText ?? 'Confirm'}
        confirmIcon={confirmModal?.confirmIcon}
        onCancel={() => {
          if (confirmModal?.loading) return;
          confirmActionRef.current = null;
          setConfirmModal(null);
        }}
        onConfirm={async () => {
          const fn = confirmActionRef.current;
          if (!fn) {
            setConfirmModal(null);
            return;
          }
          await fn();
        }}
      />

      <ConfirmModal
        visible={!!infoModal}
        tone={infoModal?.tone ?? 'neutral'}
        label={infoModal?.tone === 'danger' ? 'ERROR' : 'INFO'}
        title={infoModal?.title ?? 'Info'}
        description={infoModal?.description}
        showCancel={false}
        confirmText="OK"
        confirmIcon={infoModal?.tone === 'danger' ? 'warning' : 'checkmark-outline'}
        onCancel={() => setInfoModal(null)}
        onConfirm={() => setInfoModal(null)}
      />
    </SafeAreaView>
  );
}

function Field({
  styles,
  label,
  icon,
  children,
  isLast = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.fieldBlock, isLast && styles.fieldBlockLast]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={20} color={theme.colors.mutedText} style={styles.fieldIcon} />
        {children}
      </View>
    </View>
  );
}

function makeStyles(mode: 'light' | 'dark') {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.dark,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadow.card,
  },
  heroAvatarWrap: { position: 'relative' },
  heroAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroAvatarEdit: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.dark,
  },
  heroAvatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub: { marginTop: 4, fontSize: 13, color: theme.colors.mutedText, fontWeight: '600' },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  miniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipBad: { backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)' },
  chipWarn: { backgroundColor: 'rgba(245,158,11,0.18)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)' },
  chipOk: { backgroundColor: 'rgba(34,197,94,0.18)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)' },
  miniChipText: { fontSize: 11, fontWeight: '800', color: theme.colors.text },
  miniChipMuted: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  miniChipMutedText: { fontSize: 11, fontWeight: '700', color: theme.colors.mutedText },
  newBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  newIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  newTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  newSub: { marginTop: 4, fontSize: 13, color: theme.colors.mutedText, fontWeight: '600' },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.mutedText,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    ...theme.shadow.card,
  },
  fieldBlock: { marginBottom: theme.spacing.md },
  fieldBlockLast: { marginBottom: 0 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.mutedText,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  fieldIcon: { marginRight: 4 },
  input: {
    flex: 1,
    fontSize: theme.text.md,
    color: theme.colors.text,
    fontWeight: '600',
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  eyeBtn: { padding: 10 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dateValue: { flex: 1, fontSize: theme.text.md, fontWeight: '700', color: theme.colors.text },
  dateDone: {
    alignItems: 'flex-end',
    paddingVertical: 8,
  },
  dateDoneText: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  feeRow: { flexDirection: 'row', gap: 8 },
  feeChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  feeChipOn: {
    backgroundColor: mode === 'dark' ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.10)',
    borderColor: theme.colors.primary,
  },
  feeChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.mutedText,
    textAlign: 'center',
  },
  feeChipTextOn: {
    color: theme.colors.primary,
  },
  methodRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  methodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  methodChipOn: { backgroundColor: 'rgba(13,148,136,0.12)', borderColor: theme.colors.primary },
  methodChipText: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText },
  methodChipTextOn: { color: theme.colors.primary },
  durationRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  durationChipOn: { backgroundColor: 'rgba(13,148,136,0.12)', borderColor: theme.colors.primary },
  durationChipText: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText },
  durationChipTextOn: { color: theme.colors.primary },

  allocHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  allocTitle: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  allocToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  allocToggleOn: {
    backgroundColor: 'rgba(13,148,136,0.12)',
    borderColor: theme.colors.primary,
  },
  allocToggleTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText },
  allocToggleTxtOn: { color: theme.colors.primary },

  shiftRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  shiftChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  shiftChipOn: { backgroundColor: 'rgba(13,148,136,0.12)', borderColor: theme.colors.primary },
  shiftChipText: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText },
  shiftChipTextOn: { color: theme.colors.primary },

  seatPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  seatPickTxt: { flex: 1, fontSize: 14, fontWeight: '800', color: theme.colors.text },
  seatMini: {
    width: 62,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  seatMiniOn: { borderColor: theme.colors.primary, backgroundColor: 'rgba(13,148,136,0.10)' },
  seatMiniTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },
  seatMiniTxtOn: { color: theme.colors.primary },

  allocDateRow: { flexDirection: 'row', gap: 10 },
  allocDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  allocDateTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },

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
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    ...theme.shadow.card,
  },
  saveBtnText: {
    color: theme.colors.dark,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
}
