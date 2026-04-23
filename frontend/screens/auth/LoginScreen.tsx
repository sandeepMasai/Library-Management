import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { Linking } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

const { height: SCREEN_H } = Dimensions.get('window');
const BRAND_LOGO = require('../../assets/android-icon-foreground.png');

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [loginType, setLoginType] = useState<'admin' | 'library' | 'student'>('student');

  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idFocus, setIdFocus] = useState(false);
  const [secretFocus, setSecretFocus] = useState(false);
  const login = useAppStore((s) => s.login);
  const role = useAppStore((s) => s.role);

  const handleLogin = async () => {
    Keyboard.dismiss();
    const id = identifier.trim();
    const sec = secret.trim();

    if (loginType === 'student') {
      if (!id || !sec) {
        Alert.alert('Required', 'Please enter mobile number and PIN.');
        return;
      }
      if (!/^\d{4}$/.test(sec)) {
        Alert.alert('Invalid PIN', 'PIN must be 4 digits.');
        return;
      }
    } else if (loginType === 'library') {
      if (!id || !sec) {
        Alert.alert('Required', 'Please enter email and password.');
        return;
      }
    } else {
      // Admin
      if (!id || !sec) {
        Alert.alert('Required', 'Please enter username and password.');
        return;
      }
    }

    setLoading(true);
    const result =
      loginType === 'library'
        ? await login(id, sec, { mode: 'password' })
        : loginType === 'student'
          ? await login(id, sec, { mode: 'pin' })
          // Backend currently expects admin secret in `pin`, so we send admin password as pin to avoid API changes.
          : await login(id, sec, { mode: 'pin' });
    setLoading(false);
    if (!result.ok) {
      Alert.alert("Couldn't sign in", result.message || 'Invalid credentials or account blocked.');
    }
  };

  useEffect(() => {
    // Redirect after successful login (role-based)
    if (!role) return;
    /**
     * Connection: role-based redirect
     * - Web: use URL paths (deep linking)
     * - Native: navigate to protected roots
     */
    if (Platform.OS === 'web') {
      const path = role === 'admin' ? '/admin' : role === 'library' ? '/dashboard' : '/student/dashboard';
      Linking.openURL(path);
      return;
    }

    if (role === 'admin') navigation.navigate('AdminRoot');
    else if (role === 'library') navigation.navigate('LibraryRoot');
    else navigation.navigate('StudentRoot');
  }, [role, navigation]);

  useEffect(() => {
    // Reset form when switching types (keeps UI clean and avoids cross-role confusion)
    setIdentifier('');
    setSecret('');
    setShowPin(false);
    setIdFocus(false);
    setSecretFocus(false);
  }, [loginType]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── Hero top ── */}
      <LinearGradient
        colors={['#0F766E', '#0D9488', '#14B8A6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
      >
        {/* Decorative circles */}
        <View style={styles.decCircle1} />
        <View style={styles.decCircle2} />

        {/* Brand */}
        <View style={styles.brandRow}>
          <View style={styles.logoShell}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="LibDesk" />
          </View>
        </View>
        <Text style={styles.secureLabel}>SECURE ACCESS</Text>
        <Text style={styles.brandName}>Track My Library</Text>
        <Text style={styles.brandTagline}>Experience the next generation of library management.</Text>
      </LinearGradient>

      {/* ── White bottom card ── */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome back</Text>

              {/* Login type toggle */}
              <View style={styles.toggleWrap}>
                {(['admin', 'library', 'student'] as const).map((t) => {
                  const active = loginType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setLoginType(t)}
                      activeOpacity={0.9}
                      style={[styles.togglePill, active && styles.togglePillActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Login as ${t}`}
                    >
                      <Text style={[styles.toggleTxt, active && styles.toggleTxtActive]}>
                        {t === 'admin' ? 'Admin' : t === 'library' ? 'Library' : 'Student'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Identifier */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>
                  {loginType === 'library' ? 'EMAIL' : loginType === 'admin' ? 'USERNAME' : 'MOBILE'}
                </Text>
                <View style={[styles.fieldRow, idFocus && styles.fieldRowFocus]}>
                  <Ionicons
                    name={loginType === 'library' ? 'mail-outline' : 'person-outline'}
                    size={18}
                    color={idFocus ? stylesVars.accent : stylesVars.icon}
                  />
                  <TextInput
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder={
                      loginType === 'library'
                        ? 'Enter email'
                        : loginType === 'admin'
                          ? 'Enter username'
                          : 'Enter mobile number'
                    }
                    placeholderTextColor={theme.colors.mutedText}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={loginType === 'library' ? 'email-address' : loginType === 'student' ? 'phone-pad' : 'default'}
                    returnKeyType="next"
                    onFocus={() => setIdFocus(true)}
                    onBlur={() => setIdFocus(false)}
                  />
                </View>
              </View>

              {/* Secret */}
              <View style={styles.fieldWrap}>
                <View style={styles.pinLabelRow}>
                  <Text style={styles.fieldLabel}>
                    {loginType === 'student' ? 'PIN' : 'PASSWORD'}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password"
                    onPress={() => Alert.alert('Forgot password', 'Please contact your library admin to reset your access.')}
                    hitSlop={10}
                  >
                    <Text style={styles.forgotTxt}>Forgot?</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.fieldRow, secretFocus && styles.fieldRowFocus]}>
                  <Ionicons
                    name="lock-closed-outline" size={18}
                    color={secretFocus ? stylesVars.accent : stylesVars.icon}
                  />
                  <TextInput
                    value={secret}
                    onChangeText={setSecret}
                    placeholder={loginType === 'student' ? 'Enter 4-digit PIN' : 'Enter your password'}
                    placeholderTextColor={theme.colors.mutedText}
                    secureTextEntry={!showPin}
                    style={[styles.input, { flex: 1 }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    keyboardType={loginType === 'student' ? 'number-pad' : 'default'}
                    maxLength={loginType === 'student' ? 4 : undefined}
                    onFocus={() => setSecretFocus(true)}
                    onBlur={() => setSecretFocus(false)}
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPin((p) => !p)} hitSlop={8}>
                    <Ionicons
                      name={showPin ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={stylesVars.icon}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign in button */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.88}
                style={styles.btnWrap}
              >
                <View style={[styles.btn, loading && { opacity: 0.7 }]}>
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.btnTxt}>Sign In</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.createRow}>
                <Text style={styles.createMuted}>New here? </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Create account"
                    onPress={() => {
                      // Connection: open library register page
                      // - Web: /register-library (deep link)
                      // - Native: navigate to RegisterLibrary screen
                      if (Platform.OS === 'web') {
                        Linking.openURL('/register-library');
                      } else {
                        navigation.navigate('RegisterLibrary');
                      }
                    }}
                  hitSlop={10}
                >
                  <Text style={styles.createLink}>Create Account</Text>
                </TouchableOpacity>
              </View>

              {/* Security note */}
              <View style={styles.secureRow}>
                <Ionicons name="shield-checkmark-outline" size={13} color={stylesVars.icon} />
                <Text style={styles.secureTxt}>AES-256 Bit Encrypted Connection</Text>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Ionicons name="information-circle-outline" size={13} color={stylesVars.accent} />
        <Text style={styles.footerHintTxt}>Contact your library admin if you need access</Text>
      </View>
    </View>
  );
}
const stylesVars = {
  accent: '#0F766E',
  icon: '#64748B',
  label: '#64748B',
};

function makeStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

  // ── Hero ──
  hero: {
    height: SCREEN_H * 0.42,
    paddingHorizontal: 24,
    paddingBottom: 28,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    alignItems: 'center',
  },
  decCircle1: {
    position: 'absolute', top: -50, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decCircle2: {
    position: 'absolute', top: 30, right: 60,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  brandRow: {
    marginBottom: 12,
    alignItems: 'center',
  },
  logoShell: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.22)',
  },
  brandLogo: {
    width: 48,
    height: 48,
  },
  secureLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  brandName: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff', letterSpacing: -0.8,
    marginBottom: 4,
    textAlign: 'center',
  },
  brandTagline: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    maxWidth: 340,
    marginBottom: 10,
    textAlign: 'center',
  },

  // ── Scroll / card ──
  // Keep a slight overlap with the hero, but avoid clipping the card header text.
  // Important: don't "center" content here; allow scrolling on small screens / when keyboard is open.
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 24,
    paddingTop: 28,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.10, shadowRadius: 28 },
      android: { elevation: 6 },
    }),
  },
  cardTitle: {
    fontSize: 22, fontWeight: '900',
    color: theme.colors.text, letterSpacing: -0.4, marginBottom: 16,
  },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillActive: {
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  toggleTxt: { fontSize: 13, fontWeight: '800', color: theme.colors.mutedText },
  toggleTxtActive: { color: theme.colors.text },

  // ── Fields ──
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: stylesVars.label,
    marginBottom: 8,
  },
  pinLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: stylesVars.accent,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: theme.colors.background,
  },
  fieldRowFocus: {
    borderColor: stylesVars.accent,
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1, fontSize: 15, color: theme.colors.text, fontWeight: '500',
  },

  // ── Button ──
  btnWrap: { marginTop: 8, marginBottom: 16 },
  btn: {
    backgroundColor: stylesVars.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 18,
  },
  btnTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },

  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  createMuted: { fontSize: 13, fontWeight: '600', color: theme.colors.mutedText },
  createLink: { fontSize: 13, fontWeight: '800', color: stylesVars.accent },

  // ── Secure note ──
  secureRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5,
  },
  secureTxt: { fontSize: 12, fontWeight: '600', color: theme.colors.mutedText },

  // ── Footer ──
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerHintTxt: { fontSize: 12, fontWeight: '600', color: stylesVars.accent },
});
}

