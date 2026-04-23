import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, apiGet, apiPut, type ApiError } from '../../services/api';
import { useAppStore } from '../../store';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Library ProfileScreen
 *
 * - Header (back + title)
 * - Profile card (avatar/logo + owner name + email + badge)
 * - Basic info (name, email, phone)
 * - Business details (library name, address, city + change logo)
 *
 * Notes:
 * - Uses backend:
 *   - GET  /api/library/profile
 *   - PUT  /api/library/profile
 *   - POST /api/library/logo (multipart)
 */
export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const currentUser = useAppStore((s) => s.currentUser);
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  // Store update can be added later (not required for UI flow).

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    libraryName: '',
    address: '',
    city: '',
    logoUrl: null as string | null,
  });

  const initial = useMemo(() => (form.name || currentUser?.ownerName || currentUser?.name || 'U').trim().slice(0, 1).toUpperCase(), [form.name, currentUser]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; profile: any }>(`/api/library/profile`);
      const p = res.profile;
      setForm({
        name: p?.name || currentUser?.ownerName || currentUser?.name || '',
        email: p?.email || currentUser?.email || '',
        phone: p?.phone || currentUser?.phone || '',
        libraryName: p?.libraryName || currentUser?.name || '',
        address: p?.address || currentUser?.address || '',
        city: p?.city || currentUser?.city || '',
        logoUrl: p?.logoUrl || currentUser?.logoUrl || null,
      });
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Failed to load profile');
      // Fallback to existing user data if available
      setForm((prev) => ({
        ...prev,
        name: currentUser?.ownerName || currentUser?.name || prev.name,
        email: currentUser?.email || prev.email,
        phone: currentUser?.phone || prev.phone,
        libraryName: currentUser?.name || prev.libraryName,
        address: currentUser?.address || prev.address,
        city: currentUser?.city || prev.city,
        logoUrl: currentUser?.logoUrl || prev.logoUrl,
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setLogoPreview(result.assets[0].uri);
    }
  };

  const uploadLogo = async () => {
    if (!logoPreview) return;
    setUploading(true);
    try {
      const formData = new FormData();
      const filename = logoPreview.split('/').pop() ?? 'logo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('logo', { uri: logoPreview, name: filename, type } as unknown as Blob);

      const response = await api.post<{ ok: boolean; profile: any }>(`/api/library/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const p = response.data?.profile;
      setForm((s) => ({ ...s, logoUrl: p?.logoUrl || s.logoUrl }));
      setLogoPreview(null);
      Alert.alert('Updated', 'Logo updated.');
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.libraryName.trim() || !form.city.trim()) {
      Alert.alert('Required', 'Name, Library name and City are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPut<{ ok: boolean; profile: any }>(`/api/library/profile`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        libraryName: form.libraryName.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
      });
      Alert.alert('Saved', 'Profile updated.');
      // keep local form fresh
      const p = res.profile;
      setForm((s) => ({
        ...s,
        name: p?.name ?? s.name,
        email: p?.email ?? s.email,
        phone: p?.phone ?? s.phone,
        libraryName: p?.libraryName ?? s.libraryName,
        address: p?.address ?? s.address,
        city: p?.city ?? s.city,
        logoUrl: p?.logoUrl ?? s.logoUrl,
      }));
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, color: theme.colors.mutedText, fontWeight: '800' }}>Loading…</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errTxt}>{error}</Text> : null}

          {/* Profile card */}
          <View style={styles.card}>
            <TouchableOpacity onPress={pickLogo} activeOpacity={0.85} style={styles.avatarWrap}>
              {logoPreview || form.logoUrl ? (
                <Image source={{ uri: logoPreview || form.logoUrl || undefined }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarTxt}>{initial}</Text>
                </View>
              )}
              <View style={styles.cameraDot}>
                {uploading ? <ActivityIndicator size={10} color="#fff" /> : <Ionicons name="camera" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{form.name || '—'}</Text>
              <Text style={styles.email} numberOfLines={1}>{form.email || '—'}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>ACCOUNT OWNER</Text>
              </View>
            </View>

            <TouchableOpacity onPress={uploadLogo} disabled={!logoPreview || uploading} activeOpacity={0.85} style={[styles.logoBtn, (!logoPreview || uploading) && { opacity: 0.6 }]}>
              <Text style={styles.logoBtnTxt}>{logoPreview ? 'Upload' : 'Change'}</Text>
            </TouchableOpacity>
          </View>

          {/* Basic info */}
          <Text style={styles.sectionTitle}>BASIC INFO</Text>
          <View style={styles.card}>
            <InputField label="Full Name" icon="person-outline" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
            <View style={styles.divider} />
            <InputField label="Email Address" icon="mail-outline" value={form.email} editable={false} onChange={() => { }} />
            <View style={styles.divider} />
            <InputField label="Phone Number" icon="call-outline" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} keyboardType="phone-pad" />
          </View>

          {/* Business details */}
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>BUSINESS DETAILS</Text>
            <TouchableOpacity onPress={pickLogo} activeOpacity={0.85} style={styles.smallBtn}>
              <Ionicons name="image-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.smallBtnTxt}>Change Logo</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <InputField label="Library Name" icon="business-outline" value={form.libraryName} onChange={(v) => setForm((s) => ({ ...s, libraryName: v }))} />
            <View style={styles.divider} />
            <InputField label="Full Address" icon="location-outline" value={form.address} onChange={(v) => setForm((s) => ({ ...s, address: v }))} multiline />
            <View style={styles.divider} />
            <InputField label="City" icon="map-outline" value={form.city} onChange={(v) => setForm((s) => ({ ...s, city: v }))} />
          </View>

          {/* Save */}
          <TouchableOpacity onPress={save} activeOpacity={0.9} style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving}>
            <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function InputField(props: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChange: (v: string) => void;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: any;
}) {
  const { label, icon, value, onChange, editable = true, multiline = false, keyboardType } = props;
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={{ paddingVertical: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon as any} size={18} color={theme.colors.mutedText} />
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={editable}
          multiline={multiline}
          keyboardType={keyboardType}
          placeholder={label}
          placeholderTextColor={theme.colors.mutedText}
          style={[styles.input, !editable && { color: theme.colors.mutedText }, multiline && { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
        />
      </View>
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg, paddingBottom: 140 },
    center: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
    errTxt: { color: theme.colors.danger, fontWeight: '900', marginBottom: 10 },

    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 30 },
    backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
    topTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },

    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { marginTop: 18, marginBottom: 8, fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadow.card,
    },

    avatarWrap: { width: 58, height: 58, borderRadius: 20, overflow: 'hidden', marginRight: 12 },
    avatarImg: { width: '100%', height: '100%' },
    avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,148,136,0.12)' },
    avatarTxt: { fontSize: 22, fontWeight: '900', color: theme.colors.primary },
    cameraDot: { position: 'absolute', right: 6, bottom: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.dark, alignItems: 'center', justifyContent: 'center' },

    name: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
    email: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
    badge: { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(250,204,21,0.35)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.55)' },
    badgeTxt: { fontSize: 10, fontWeight: '900', color: '#854D0E', letterSpacing: 0.5 },

    logoBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' },
    logoBtnTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.text },

    fieldLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 6 },
    inputShell: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingHorizontal: 12, backgroundColor: theme.colors.surface },
    input: { flex: 1, minHeight: 46, fontSize: 14, fontWeight: '800', color: theme.colors.text, paddingVertical: Platform.OS === 'ios' ? 12 : 10 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

    smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border },
    smallBtnTxt: { fontSize: 12, fontWeight: '900', color: theme.colors.primary },

    saveBtn: { marginTop: 18, backgroundColor: theme.colors.primary, borderRadius: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    saveTxt: { color: '#fff', fontWeight: '900', letterSpacing: 0.7 },
  });
}

