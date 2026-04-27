import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../../theme';

type Params = {
  message?: string;
  retryTo?: string;
};

export default function PaymentErrorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route?.params || {}) as Params;
  const message = (params?.message || '').trim() || 'Something went wrong. Please try again later.';
  const retryTo = String(params?.retryTo || '').trim() || 'Subscription';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.root}>
        <View style={styles.iconWrap}>
          <Ionicons name="close-circle" size={64} color={theme.colors.danger} />
        </View>
        <Text style={styles.title}>Payment Failed</Text>
        <Text style={styles.sub}>{message}</Text>

        <View style={styles.row}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.goBack()} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryTxt}>Go Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              // Navigate to a safe screen where user can start payment again.
              // Default: Subscription screen.
              navigation.navigate(retryTo);
            }}
            style={styles.btnPrimary}
          >
            <Text style={styles.btnPrimaryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, padding: 18, justifyContent: 'center', alignItems: 'center' },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 20 },
  sub: { marginTop: 6, color: theme.colors.mutedText, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnSecondary: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryTxt: { color: theme.colors.text, fontWeight: '900' },
  btnPrimary: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryTxt: { color: theme.colors.surface, fontWeight: '900' },
});

