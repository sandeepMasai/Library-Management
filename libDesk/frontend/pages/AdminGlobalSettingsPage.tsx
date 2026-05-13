import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPut, type ApiError } from '../services/api';
import { theme } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { ConfirmModal } from '../components/ConfirmModal';

type GlobalSettingsDto = {
  ok: boolean;
  settings: {
    privacyPolicyUrl: string;
    termsUrl: string;
    communication: { whatsapp: string; channel: string; email: string };
    updatedAt: string | null;
  };
};

export default function AdminGlobalSettingsPage() {
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('');
  const [termsUrl, setTermsUrl] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [channel, setChannel] = useState('');
  const [email, setEmail] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; description?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<GlobalSettingsDto>('/api/settings');
      setPrivacyPolicyUrl(data.settings.privacyPolicyUrl || '');
      setTermsUrl(data.settings.termsUrl || '');
      setWhatsapp(data.settings.communication?.whatsapp || '');
      setChannel(data.settings.communication?.channel || '');
      setEmail(data.settings.communication?.email || '');
      setUpdatedAt(data.settings.updatedAt || null);
    } catch (e: any) {
      const err = e as ApiError;
      setInfoModal({ title: 'Failed to load', description: err.message || 'Could not load settings.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const p = privacyPolicyUrl.trim();
    const t = termsUrl.trim();
    const w = whatsapp.trim();
    const c = channel.trim();
    const e = email.trim();
    if (!p || !t) {
      setInfoModal({ title: 'Required', description: 'Please enter both Privacy Policy URL and Terms URL.' });
      return;
    }
    setSaving(true);
    try {
      const data = await apiPut<GlobalSettingsDto>('/api/settings', {
        privacyPolicyUrl: p,
        termsUrl: t,
        communication: { whatsapp: w, channel: c, email: e },
      });
      setUpdatedAt(data.settings.updatedAt || null);
      setInfoModal({ title: 'Saved', description: 'URLs updated successfully.' });
    } catch (e: any) {
      const err = e as ApiError;
      setInfoModal({ title: 'Save failed', description: err.message || 'Could not save settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView style={styles.safe} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroTitle}>Global URLs</Text>
            <Text style={styles.heroSub}>Super Admin can update Privacy/Terms links.</Text>
            {updatedAt ? <Text style={styles.heroMeta}>Updated: {updatedAt}</Text> : null}
          </View>
          <TouchableOpacity onPress={load} activeOpacity={0.85} style={styles.refreshBtn} disabled={loading || saving}>
            <Ionicons name="refresh-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingTxt}>Loading…</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>PRIVACY POLICY URL</Text>
            <View style={styles.inputShell}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.mutedText} />
              <TextInput
                value={privacyPolicyUrl}
                onChangeText={setPrivacyPolicyUrl}
                placeholder="https://example.com/privacy"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>TERMS URL</Text>
            <View style={styles.inputShell}>
              <Ionicons name="document-text-outline" size={18} color={theme.colors.mutedText} />
              <TextInput
                value={termsUrl}
                onChangeText={setTermsUrl}
                placeholder="https://example.com/terms"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={[styles.label, { marginTop: 18 }]}>WHATSAPP NUMBER</Text>
            <View style={styles.inputShell}>
              <Ionicons name="logo-whatsapp" size={18} color={theme.colors.mutedText} />
              <TextInput
                value={whatsapp}
                onChangeText={setWhatsapp}
                placeholder="919999999999"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>CHANNEL LINK</Text>
            <View style={styles.inputShell}>
              <Ionicons name="megaphone-outline" size={18} color={theme.colors.mutedText} />
              <TextInput
                value={channel}
                onChangeText={setChannel}
                placeholder="https://whatsapp.com/channel/xxx"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>EMAIL</Text>
            <View style={styles.inputShell}>
              <Ionicons name="mail-outline" size={18} color={theme.colors.mutedText} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="support@yourapp.com"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <TouchableOpacity onPress={save} activeOpacity={0.9} style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving}>
              <Ionicons name={saving ? 'time-outline' : 'save-outline'} size={18} color="#fff" />
              <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={!!infoModal}
        tone="neutral"
        label="INFO"
        title={infoModal?.title ?? 'Info'}
        description={infoModal?.description}
        showCancel={false}
        confirmText="OK"
        confirmIcon="checkmark-outline"
        onCancel={() => setInfoModal(null)}
        onConfirm={() => setInfoModal(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(mode: 'light' | 'dark') {
  const isDark = mode === 'dark';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 28 },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      ...theme.shadow.card,
    },
    heroIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.28)' : '#C7D2FE',
    },
    heroTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
    heroSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },
    heroMeta: { marginTop: 4, fontSize: 11, fontWeight: '700', color: theme.colors.mutedText },
    refreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
    loadingTxt: { fontSize: 13, fontWeight: '700', color: theme.colors.mutedText },
    card: {
      marginTop: 14,
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      ...theme.shadow.card,
    },
    label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, color: theme.colors.mutedText },
    inputShell: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      backgroundColor: theme.colors.background,
      minHeight: 50,
    },
    input: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, paddingVertical: 12 },
    saveBtn: {
      marginTop: 16,
      height: 50,
      borderRadius: 16,
      backgroundColor: theme.colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    saveTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  });
}

