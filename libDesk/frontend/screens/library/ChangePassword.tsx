import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

export default function LibraryChangePasswordScreen() {
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);

  const changePassword = useAppStore((s) => s.changeLibraryPassword);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const onSave = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Current password', 'Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('New password', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirm) {
      Alert.alert('New password', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (!res.ok) {
        Alert.alert('Failed', res.message || 'Could not change password.');
        return;
      }
      Alert.alert('Done', 'Password updated.');
      navigation.goBack();
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
          <Text style={styles.title}>Change Password</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Current password</Text>
          <View style={styles.inputShell}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.colors.mutedText} />
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              secureTextEntry
            />
          </View>

          <Text style={styles.label}>New password</Text>
          <View style={styles.inputShell}>
            <Ionicons name="key-outline" size={18} color={theme.colors.mutedText} />
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              secureTextEntry
            />
          </View>

          <Text style={styles.label}>Confirm password</Text>
          <View style={styles.inputShell}>
            <Ionicons name="key-outline" size={18} color={theme.colors.mutedText} />
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm password"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={onSave}
            />
          </View>

          <TouchableOpacity onPress={onSave} activeOpacity={0.9} style={[styles.btn, loading && { opacity: 0.7 }]} disabled={loading}>
            <Text style={styles.btnTxt}>{loading ? 'Saving…' : 'Update password'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    label: { marginTop: 12, marginBottom: 6, fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 0.8, textTransform: 'uppercase' },
    inputShell: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingHorizontal: 12, backgroundColor: theme.colors.background, minHeight: 50 },
    input: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, paddingVertical: 12 },
    btn: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
    btnTxt: { color: theme.colors.dark, fontWeight: '900' },
  });
}

