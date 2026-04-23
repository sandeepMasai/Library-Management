import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, apiGet, type ApiError } from '../../services/api';
import { theme } from '../../theme';
import { useAppStore } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * LibraryBrandingScreen
 *
 * Sections:
 * 1) Header
 * 2) Logo upload card (preview + upload)
 * 3) Why add logo card
 * 4) Invoice header preview card
 */
export default function LibraryBrandingScreen() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const patchCurrentUser = useAppStore((s) => s.patchCurrentUser);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ libraryName: string; address: string; logoUrl: string | null }>({
    libraryName: '',
    address: '',
    logoUrl: null,
  });

  const currentLogo = logoPreview || profile.logoUrl || null;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; profile: any }>(`/api/library/profile`);
      const p = res.profile;
      setProfile({
        libraryName: String(p?.libraryName || ''),
        address: String(p?.address || p?.city || ''),
        logoUrl: p?.logoUrl || null,
      });
    } catch {
      // Non-fatal: still allow upload UI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
    if (result.canceled || !result.assets[0]?.uri) return;
    setLogoPreview(result.assets[0].uri); // preview instantly
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

      const response = await api.post<{ ok: boolean; logoUrl: string; profile: any }>(`/api/library/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const logoUrl = response.data?.logoUrl || response.data?.profile?.logoUrl || null;
      setProfile((s) => ({ ...s, logoUrl }));
      patchCurrentUser({ logoUrl } as any);
      setLogoPreview(null);
      Alert.alert('Updated', 'Library logo updated.');
    } catch (e: any) {
      const err = e as ApiError;
      Alert.alert('Error', err?.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const helperText = useMemo(() => 'Supports JPG & PNG. Best fit: Square (1:1 aspect ratio).', []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Library Branding</Text>
          <Text style={styles.topSub}>Build your institutional identity</Text>
        </View>
      </View>

      {/* Logo upload card */}
      <View style={styles.card}>
        <Text style={styles.kicker}>CURRENT LOGO</Text>
        <View style={styles.logoBox}>
          {loading ? (
            <ActivityIndicator />
          ) : currentLogo ? (
            <Image source={{ uri: currentLogo }} style={styles.logoImg} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="business-outline" size={30} color={theme.colors.mutedText} />
              <Text style={styles.placeholderTxt}>No Logo Uploaded</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={logoPreview ? uploadLogo : pickLogo}
          style={[styles.uploadBtn, uploading && { opacity: 0.7 }]}
          disabled={uploading}
        >
          <Ionicons name={logoPreview ? 'cloud-upload-outline' : 'cloud-upload-outline'} size={18} color="#fff" />
          <Text style={styles.uploadTxt}>
            {uploading ? 'Uploading…' : logoPreview ? 'Upload Library Logo' : 'Upload Library Logo'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.helper}>{helperText}</Text>
      </View>

      {/* Why add logo */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View style={styles.infoDot}>
            <Ionicons name="information" size={16} color="#0F766E" />
          </View>
          <Text style={styles.whyTitle}>Why add a logo?</Text>
        </View>
        <Text style={styles.whySub}>Adding your logo will automatically brand all your:</Text>

        <View style={{ marginTop: 12, gap: 10 }}>
          <BenefitRow icon="chatbubble-ellipses-outline" text="Automated WhatsApp Invoices" />
          <BenefitRow icon="document-text-outline" text="PDF Receipt Reports" />
          <BenefitRow icon="qr-code-outline" text="Digital Access QR Code" />
        </View>
      </View>

      {/* Invoice preview */}
      <View style={styles.card}>
        <Text style={styles.kicker}>INVOICE HEADER PREVIEW</Text>
        <View style={styles.invoice}>
          <View style={styles.invoiceRow}>
            <View style={styles.invoiceLogo}>
              {currentLogo ? (
                <Image source={{ uri: currentLogo }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={[styles.invoiceLogo, { backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="image-outline" size={18} color={theme.colors.mutedText} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.invoiceName} numberOfLines={1}>
                {profile.libraryName || 'Library Name'}
              </Text>
              <Text style={styles.invoiceAddr} numberOfLines={2}>
                {profile.address || 'Address'}
              </Text>
            </View>
          </View>
          <View style={styles.line} />
          <View style={[styles.line, { width: '75%' }]} />
          <View style={[styles.line, { width: '55%' }]} />
        </View>
      </View>
    </ScrollView>
  );
}

function BenefitRow(props: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={styles.benefitRow}>
      <Ionicons name={props.icon as any} size={18} color="#0F766E" />
      <Text style={styles.benefitTxt}>{props.text}</Text>
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.lg, paddingTop: 10, paddingBottom: 140 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20
  },
  topTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginTop: 30 },
  topSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginTop: 12,
    ...theme.shadow.card,
  },
  kicker: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2, marginBottom: 10 },

  logoBox: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  logoImg: { width: '100%', height: '100%' },
  logoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderTxt: { fontWeight: '800', color: theme.colors.mutedText },

  uploadBtn: {
    marginTop: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  uploadTxt: { color: '#fff', fontWeight: '900' },
  helper: { marginTop: 10, color: theme.colors.mutedText, fontWeight: '700', textAlign: 'center' },

  infoDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(15,118,110,0.12)', alignItems: 'center', justifyContent: 'center' },
  whyTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  whySub: { color: theme.colors.mutedText, fontWeight: '700', lineHeight: 18 },

  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitTxt: { fontWeight: '800', color: theme.colors.text },

  invoice: { marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14 },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  invoiceLogo: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border },
  invoiceName: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  invoiceAddr: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
  line: { height: 8, borderRadius: 6, backgroundColor: theme.colors.border, marginTop: 10 },
});
}

