import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { useAppStore } from '../../store';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

const ACCENT = '#4F46E5';
const GREEN  = '#059669';
const AMBER  = '#D97706';

export default function StudentScanQR() {
  const insets             = useSafeAreaInsets();
  const { width, height }  = useWindowDimensions();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned,       setScanned]       = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const markAttendance = useAppStore((s) => s.markAttendance);
  const navigation     = useNavigation<any>();

  // Adaptive square: fits screen without scrolling
  const usableH = height - insets.top - insets.bottom;
  const camSize = Math.min(width - 40, Math.floor(usableH * 0.42));

  const scanBox = useMemo(() => {
    const w = width - theme.spacing.md * 2 - theme.spacing.lg * 2;
    const s = Math.round(Math.min(w * 0.62, 198));
    return Math.max(s, 148);
  }, [width]);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // ── Scan logic (unchanged) ─────────────────────────────────────────────
  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (isSubmitting || scanned) return;
    setScanned(true);
    setIsSubmitting(true);
    const result = await markAttendance(data);
    if (result.ok && !result.alreadyMarked) {
      Alert.alert('Success', result.message || 'Attendance Marked', [
        { text: 'OK', onPress: () => { setScanned(false); navigation.navigate('Home'); } },
      ]);
    } else if (result.ok && result.alreadyMarked) {
      Alert.alert('Already Marked', result.message || 'Attendance already recorded today', [
        { text: 'OK', onPress: () => { setScanned(false); navigation.navigate('Home'); } },
      ]);
    } else {
      Alert.alert('Error', result.message || 'Invalid QR Code.', [
        { text: 'Try Again', onPress: () => setScanned(false) },
      ]);
    }
    setIsSubmitting(false);
  };

  // ── Permission: loading ────────────────────────────────────────────────
  if (hasPermission === null) {
    return (
      <View style={styles.permScreen}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.permLoadTxt}>Opening camera…</Text>
      </View>
    );
  }

  // ── Permission: denied ─────────────────────────────────────────────────
  if (hasPermission === false) {
    return (
      <View style={styles.permScreen}>
        <View style={styles.permIconBox}>
          {/* Use a valid Ionicons name (type-safe) */}
          <Ionicons name="camera-outline" size={36} color="#EF4444" />
        </View>
        <Text style={styles.permTitle}>Camera blocked</Text>
        <Text style={styles.permSub}>Allow camera access in device Settings.</Text>
      </View>
    );
  }

  const status = isSubmitting ? 'verifying' : scanned ? 'scanned' : 'idle';
  const statusColor =
    status === 'idle'    ? GREEN :
    status === 'scanned' ? AMBER : ACCENT;
  const statusLabel =
    status === 'idle'      ? 'Position the QR code inside the frame' :
    status === 'scanned'   ? 'QR code detected — please wait'        :
                             'Checking your attendance…';

  // ── Main UI ────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.inner}>

        {/* ── Status row (above camera) ── */}
        <View style={styles.statusRow}>
          {status === 'verifying'
            ? <ActivityIndicator size={12} color={ACCENT} />
            : <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          }
          <Text style={[styles.statusTxt, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>

        {/* ── Square camera ── */}
        <View style={[styles.camCard, { width: camSize, height: camSize }]}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />

          {/* Dim overlay + scan hole */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={styles.dimTop} />
            <View style={[styles.dimMidRow, { height: scanBox }]}>
              <View style={styles.dimSide} />
              {/* ── Scan hole + corner ticks (UNCHANGED) ── */}
              <View style={[styles.scanHole, { width: scanBox, height: scanBox }]}>
                <View style={[styles.tick, styles.tl]} />
                <View style={[styles.tick, styles.tr]} />
                <View style={[styles.tick, styles.bl]} />
                <View style={[styles.tick, styles.br]} />
              </View>
              <View style={styles.dimSide} />
            </View>
            <View style={styles.dimBottom} />
          </View>

          {/* Verifying overlay */}
          {isSubmitting && (
            <View style={styles.verifyOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#C7D2FE" />
              <Text style={styles.verifyTxt}>Verifying…</Text>
            </View>
          )}
        </View>

        {/* ── Scan again ── */}
        {scanned ? (
          <TouchableOpacity
            style={styles.againBtn}
            onPress={() => !isSubmitting && setScanned(false)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#4338CA', '#6D28D9']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.againGrad}
            >
              <Ionicons name="scan-outline" size={18} color="#fff" />
              <Text style={styles.againTxt}>Scan Again</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={{ height: 50 }} />
        )}

        {/* ── Divider ── */}
        <View style={styles.divider}>
          <View style={styles.divLine} />
          <Text style={styles.divTxt}>BEFORE YOU SCAN</Text>
          <View style={styles.divLine} />
        </View>

        {/* ── 3 pills ── */}
        <View style={styles.pillsRow}>
          <View style={[styles.pill, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="wifi-outline" size={13} color={ACCENT} />
            <Text style={[styles.pillTxt, { color: ACCENT }]}>Internet required</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="qr-code-outline" size={13} color={GREEN} />
            <Text style={[styles.pillTxt, { color: GREEN }]}>Scan library QR</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="today-outline" size={13} color={AMBER} />
            <Text style={[styles.pillTxt, { color: AMBER }]}>One scan per day</Text>
          </View>
        </View>


      </View>
    </View>
  );
}

// ── Tick constant (UNCHANGED) ─────────────────────────────────────────────
const T   = 14;
const DIM = 'rgba(0,0,0,0.62)';

function makeStyles() {
  return StyleSheet.create({

  // Permission
  permScreen: {
    flex: 1, backgroundColor: theme.colors.background,
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  permLoadTxt: { fontSize: 14, fontWeight: '600', color: ACCENT },
  permIconBox: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    alignItems: 'center', justifyContent: 'center',
  },
  permTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  permSub:   { fontSize: 13, color: theme.colors.mutedText, textAlign: 'center', lineHeight: 20 },

  // Root
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusTxt: { fontSize: 13, fontWeight: '600', textAlign: 'center', flex: 1 },

  // Square camera card
  camCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 14,
    marginBottom: 20,
  },

  // Dim overlay
  dimTop:    { flex: 1, backgroundColor: DIM },
  dimMidRow: { flexDirection: 'row' },
  dimSide:   { flex: 1, backgroundColor: DIM },
  dimBottom: { flex: 1, backgroundColor: DIM },
  scanHole:  { backgroundColor: 'transparent' },

  // Corner ticks (UNCHANGED)
  tick: { position: 'absolute', width: T, height: T, borderColor: '#EEF2FF' },
  tl: { top: 0,    left:  0, borderTopWidth: 3,    borderLeftWidth: 3,  borderTopLeftRadius: 10 },
  tr: { top: 0,    right: 0, borderTopWidth: 3,    borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: 0, left:  0, borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },

  // Verifying overlay
  verifyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,20,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  verifyTxt: { color: '#C7D2FE', fontSize: 14, fontWeight: '700' },

  // Scan again
  againBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  againGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 15,
  },
  againTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Divider
  divider: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, width: '100%', marginBottom: 14,
  },
  divLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  divTxt:  { fontSize: 10, fontWeight: '800', color: theme.colors.mutedText, letterSpacing: 1.2 },

  // 3 pills
  pillsRow: {
    flexDirection: 'row', gap: 8,
    flexWrap: 'wrap', justifyContent: 'center',
    width: '100%', marginBottom: 14,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999,
  },
  pillTxt: { fontSize: 12, fontWeight: '700' },

});
}
