import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useAppStore, FeeMethod, FeeStatus } from '../../store';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInDays, format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

export default function AdminStudentForm() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(mode), [mode]);
  const studentId = route.params?.studentId;

  const users = useAppStore((state) => state.users);
  const fetchStudents = useAppStore((state) => state.fetchStudents);
  const addStudent = useAppStore((state) => state.addStudent);
  const updateStudent = useAppStore((state) => state.updateStudent);
  const uploadStudentPhoto = useAppStore((state) => state.uploadStudentPhoto);

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
      Alert.alert('Missing fields', 'Please fill all fields.');
      return;
    }

    // PIN rules:
    // - required on create
    // - optional on edit (only updates if provided)
    if (!isEditing && !formData.pin.trim()) {
      Alert.alert('Missing PIN', 'Please set a 4-digit PIN for the student.');
      return;
    }
    if (formData.pin.trim() && !/^\d{4}$/.test(formData.pin.trim())) {
      Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
      return;
    }

    // Use current timestamp if join date is today (avoids UTC-midnight timezone offset)
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isJoinToday = formData.joinDate === todayStr;
    const parsedJoinDate = isJoinToday ? new Date() : new Date(formData.joinDate + 'T12:00:00');
    if (Number.isNaN(parsedJoinDate.getTime())) {
      Alert.alert('Invalid date', 'Joining date is invalid.');
      return;
    }

    const feeNum = Number(formData.feeAmount);
    if (Number.isNaN(feeNum) || feeNum < 0) {
      Alert.alert('Invalid fee', 'Enter a valid fee amount.');
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

    Alert.alert(
      isEditing ? 'Save Changes?' : 'Create Student?',
      isEditing
        ? `Are you sure you want to update details for ${formData.name.trim()}?`
        : `Create a new student account for ${formData.name.trim()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isEditing ? 'Save' : 'Create',
          style: 'default',
          onPress: async () => {
            let result: { ok: boolean; message?: string };
            if (isEditing) {
              result = await updateStudent(studentId, payload);
            } else {
              result = await addStudent({ ...payload, isBlocked: false });
            }

            if (!result.ok) {
              const msg = result.message || 'Something went wrong.';
              // Duplicate username/mobile handling (backend returns 409 with a clean message)
              if (msg.toLowerCase().includes('already exists')) {
                Alert.alert('Duplicate', msg);
              } else {
                Alert.alert('Could not save', msg);
              }
              return;
            }

            await fetchStudents();

            if (pendingPhotoUri) {
              const savedId = isEditing ? studentId : (result as { ok: boolean; student?: { id: string } }).student?.id;
              if (savedId) {
                setUploadingPhoto(true);
                const photoResult = await uploadStudentPhoto(savedId, pendingPhotoUri);
                setUploadingPhoto(false);
                if (!photoResult.ok) {
                  Alert.alert('Photo upload failed', photoResult.message || 'Could not upload photo. You can try again by editing the student.');
                }
              }
            }

            navigation.goBack();
          },
        },
      ]
    );
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.92}>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.saveBtnText}>{isEditing ? 'Save changes' : 'Create student'}</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
