import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../theme';

export default function PaymentSuccessScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.root}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.success} />
        </View>
        <Text style={styles.title}>Payment Successful</Text>
        <Text style={styles.sub}>Your subscription is now active.</Text>

        <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.goBack()} style={styles.btn}>
          <Text style={styles.btnTxt}>Done</Text>
        </TouchableOpacity>
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
    backgroundColor: 'rgba(22,163,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 20 },
  sub: { marginTop: 6, color: theme.colors.mutedText, fontWeight: '800', textAlign: 'center' },
  btn: {
    marginTop: 18,
    minWidth: 180,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: { color: theme.colors.surface, fontWeight: '900' },
});

