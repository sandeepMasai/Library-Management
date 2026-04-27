import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';
import { theme } from '../../theme';

export default function AdminSettingsScreen() {
  const currentUser = useAppStore((s) => s.currentUser);
  const logout = useAppStore((s) => s.logout);

  const onLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.kicker}>ADMIN</Text>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.row}>
          <Ionicons name="person-circle-outline" size={22} color={theme.colors.mutedText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Signed in as</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {currentUser?.name || 'Admin'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.btnTxt}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    ...theme.shadow.card,
  },
  kicker: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  rowTitle: { fontSize: 12, fontWeight: '900', color: theme.colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.9 },
  rowSub: { marginTop: 2, fontSize: 14, fontWeight: '900', color: theme.colors.text },
  btn: {
    marginTop: 18,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
});

