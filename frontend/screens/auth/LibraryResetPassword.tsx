import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function LibraryResetPasswordScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);

  const resetPassword = useAppStore((s) => s.resetLibraryPassword);

  const tokenFromRoute = String(route.params?.token || '').trim();
  const [token, setToken] = React.useState(tokenFromRoute);
  const [pw1, setPw1] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [infoModal, setInfoModal] = React.useState<{ title: string; description?: string; afterOk?: () => void } | null>(null);

  const onReset = async () => {
    const t = token.trim();
    if (!t) {
      setInfoModal({ title: 'Token', description: 'Reset token is missing.' });
      return;
    }
    if (!pw1 || pw1.length < 6) {
      setInfoModal({ title: 'Password', description: 'Password must be at least 6 characters.' });
      return;
    }
    if (pw1 !== pw2) {
      setInfoModal({ title: 'Password', description: 'Passwords do not match.' });
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(t, pw1);
      if (!res.ok) {
        setInfoModal({ title: 'Failed', description: res.message || 'Could not reset password.' });
        return;
      }
      setInfoModal({
        title: 'Done',
        description: 'Password updated. Please login.',
        afterOk: () => navigation.navigate('Login'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Reset Password</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sub}>Paste your reset token and set a new password.</Text>

          <Text style={styles.label}>Reset token</Text>
          <View style={styles.inputShell}>
            <Ionicons name="key-outline" size={18} color={theme.colors.mutedText} />
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder="Paste token here"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>New password</Text>
          <View style={styles.inputShell}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.colors.mutedText} />
            <TextInput
              value={pw1}
              onChangeText={setPw1}
              placeholder="New password"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              secureTextEntry
            />
          </View>

          <Text style={styles.label}>Confirm password</Text>
          <View style={styles.inputShell}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.colors.mutedText} />
            <TextInput
              value={pw2}
              onChangeText={setPw2}
              placeholder="Confirm password"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={onReset}
            />
          </View>

          <TouchableOpacity onPress={onReset} activeOpacity={0.9} style={[styles.btn, loading && { opacity: 0.7 }]} disabled={loading}>
            <Text style={styles.btnTxt}>{loading ? 'Updating…' : 'Update password'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={!!infoModal}
        tone="neutral"
        label="INFO"
        title={infoModal?.title ?? 'Info'}
        description={infoModal?.description}
        showCancel={false}
        confirmText="OK"
        confirmIcon="checkmark-outline"
        onCancel={() => {
          const fn = infoModal?.afterOk;
          setInfoModal(null);
          fn?.();
        }}
        onConfirm={() => {
          const fn = infoModal?.afterOk;
          setInfoModal(null);
          fn?.();
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
    card: { margin: 16, backgroundColor: theme.colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.card },
    sub: { color: theme.colors.mutedText, fontWeight: '700', lineHeight: 18 },
    label: { marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 0.8, textTransform: 'uppercase' },
    inputShell: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingHorizontal: 12, backgroundColor: theme.colors.background, minHeight: 50 },
    input: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, paddingVertical: 12 },
    btn: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
    btnTxt: { color: theme.colors.dark, fontWeight: '900' },
  });
}

