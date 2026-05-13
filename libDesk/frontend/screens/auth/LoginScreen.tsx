import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useAppStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { Linking } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmModal } from '../../components/ConfirmModal';

const { height: SCREEN_H } = Dimensions.get('window');
const IS_SMALL_DEVICE = SCREEN_H < 720;
const BRAND_LOGO = require('../../assets/logo.png');
const DEFAULT_LOGIN_ERROR = 'Invalid credentials or account blocked.';
const NETWORK_LOGIN_ERROR = 'Please check your internet connection';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripTechnicalDetails(message: string): string {
  return message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^API:/i.test(line))
    .filter((line) => !/(adb reverse|EXPO_PUBLIC_|https?:\/\/|10\.0\.2\.2|localhost:\d+)/i.test(line))
    .join('\n');
}

function hasTechnicalDetails(message: string): boolean {
  return /(API:|adb reverse|EXPO_PUBLIC_|https?:\/\/|10\.0\.2\.2|localhost:\d+|status code|Axios|stack|Backend unavailable)/i.test(message);
}

function getFriendlyLoginError(message?: string): string {
  const raw = message?.trim();
  if (!raw) return DEFAULT_LOGIN_ERROR;
  if (/Network/i.test(raw)) return NETWORK_LOGIN_ERROR;

  const cleaned = stripTechnicalDetails(raw);
  if (!__DEV__ && hasTechnicalDetails(raw)) {
    return DEFAULT_LOGIN_ERROR;
  }

  return cleaned || DEFAULT_LOGIN_ERROR;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(IS_SMALL_DEVICE), [mode]);
  const [loginType, setLoginType] = useState<'library' | 'student'>('student');
  const [secretTapCount, setSecretTapCount] = useState(0);

  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idFocus, setIdFocus] = useState(false);
  const [secretFocus, setSecretFocus] = useState(false);
  const login = useAppStore((s) => s.login);
  const role = useAppStore((s) => s.role);
  const [infoModal, setInfoModal] = useState<{ title: string; description?: string } | null>(null);

  const handleLogin = async () => {
    Keyboard.dismiss();
    const id = identifier.trim();
    const sec = secret.trim();

    if (loginType === 'student') {
      if (!id || !sec) {
        setInfoModal({ title: 'Required', description: 'Please enter mobile number and PIN.' });
        return;
      }
      if (!/^\d{7,15}$/.test(id)) {
        setInfoModal({ title: 'Invalid mobile', description: 'Mobile number must contain digits only.' });
        return;
      }
      if (!/^\d{4}$/.test(sec)) {
        setInfoModal({ title: 'Invalid PIN', description: 'PIN must be 4 digits.' });
        return;
      }
    } else if (loginType === 'library') {
      if (!id || !sec) {
        setInfoModal({ title: 'Required', description: 'Please enter email and password.' });
        return;
      }
      if (!EMAIL_REGEX.test(id.toLowerCase())) {
        setInfoModal({ title: 'Invalid email', description: 'Please enter a valid email address.' });
        return;
      }
      if (sec.length < 6) {
        setInfoModal({ title: 'Invalid password', description: 'Password must be at least 6 characters.' });
        return;
      }
    }
    setLoading(true);
    const result =
      loginType === 'library'
        ? await login(id, sec, { mode: 'password' })
        : await login(id, sec, { mode: 'pin' });
    setLoading(false);
    if (!result.ok) {
      setInfoModal({
        title: "Couldn't sign in",
        description: getFriendlyLoginError(result.message),
      });
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
      const path = role === 'library' ? '/dashboard' : '/student/dashboard';
      Linking.openURL(path);
      return;
    }

    if (role === 'library') navigation.navigate('LibraryRoot');
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
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => navigation.navigate('AdminLogin')}
            onPress={() => {
              // Optional hidden entry: 7 taps on logo opens admin login (web + native).
              setSecretTapCount((c) => {
                const next = c + 1;
                if (next >= 7) {
                  navigation.navigate('AdminLogin');
                  return 0;
                }
                return next;
              });
            }}
            style={styles.logoShell}
          >
            <Image
              source={BRAND_LOGO}
              style={{ width: 75, height: 75 }}
              resizeMode="contain"
              accessibilityLabel="LibDesk"
            />
          </TouchableOpacity>
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
                {(['library', 'student'] as const).map((t) => {
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
                        {t === 'library' ? 'Library' : 'Student'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Identifier */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>
                  {loginType === 'library' ? 'EMAIL' : 'MOBILE'}
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
                        : 'Enter mobile number'
                    }
                    placeholderTextColor={theme.colors.mutedText}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={loginType === 'library' ? 'email-address' : 'phone-pad'}
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
                  {loginType === 'library' ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Forgot password"
                      onPress={() => navigation.navigate('LibraryForgotPassword')}
                      hitSlop={10}
                    >
                      <Text style={styles.forgotTxt}>Forgot?</Text>
                    </TouchableOpacity>
                  ) : null}
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

              {loginType === 'library' ? (
                <View style={styles.createRow}>
                  <Text style={styles.createMuted}>New here? </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                    onPress={() => {
                      // Library signup only (admin accounts aren't created in-app).
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
              ) : null}

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
    </View>
  );
}
const stylesVars = {
  accent: '#0F766E',
  icon: '#64748B',
  label: '#64748B',
};

function makeStyles(isSmall: boolean) {
  const heroH = Math.max(170, Math.min(SCREEN_H * (isSmall ? 0.22 : 0.24), 230));
  const logoShell = isSmall ? 68 : 74;
  const brandNameSize = isSmall ? 24 : 26;
  const taglineSize = isSmall ? 11 : 12;
  const cardPad = isSmall ? 14 : 16;
  const fieldPadV = isSmall ? 11 : 12;
  const fieldMinH = isSmall ? 48 : 52;
  const btnPadV = isSmall ? 11 : 12;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },

    // ── Hero ──
    hero: {
      height: heroH,
      paddingHorizontal: 18,
      paddingBottom: 10,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',

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
      marginBottom: 10,
      alignItems: 'center',
    },
    logoShell: {
      width: logoShell,
      height: logoShell,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.94)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(15,118,110,0.18)',
    },
    secureLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 2,
      color: 'rgba(255,255,255,0.9)',
      marginBottom: 4,
    },
    brandName: {
      fontSize: brandNameSize,
      fontWeight: '900',
      color: '#fff', letterSpacing: -0.8,
      marginBottom: 0,
      textAlign: 'center',
    },
    brandTagline: {
      fontSize: taglineSize,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.85)',
      maxWidth: 340,
      marginBottom: 4,
      textAlign: 'center',
    },

    // ── Scroll / card ──
    // Keep a slight overlap with the hero, but avoid clipping the card header text.
    // Important: don't "center" content here; allow scrolling on small screens / when keyboard is open.
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 16,
    },
    card: {
      backgroundColor: theme.colors.surface,
      width: '90%',
      marginLeft: 18,
      marginTop: 30,
      borderRadius: 22,
      padding: cardPad,
      paddingTop: cardPad,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 18 },
        android: { elevation: 4 },
      }),
    },
    cardTitle: {
      fontSize: isSmall ? 17 : 18,
      fontWeight: '900',
      color: theme.colors.text,
      letterSpacing: -0.2,
      marginBottom: 10,
      textAlign: 'center',
    },

    toggleWrap: {
      flexDirection: 'row',
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      padding: 4,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    togglePill: {
      flex: 1,
      paddingVertical: isSmall ? 7 : 8,
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
    toggleTxt: { fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
    toggleTxtActive: { color: theme.colors.text },

    // ── Fields ──
    fieldWrap: { marginBottom: 9 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: stylesVars.label,
      marginBottom: 6,
    },
    pinLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    forgotTxt: {
      fontSize: 14,
      marginTop: 11,
      marginBottom: 11,
      fontWeight: '700',
      color: stylesVars.accent,
    },
    fieldRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      width: '100%',
      borderWidth: 1.5, borderColor: theme.colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: fieldPadV,
      minHeight: fieldMinH,
      backgroundColor: theme.colors.background,
    },
    fieldRowFocus: {
      borderColor: stylesVars.accent,
      backgroundColor: theme.colors.surface,

    },
    input: {

      flex: 1,
      fontSize: 14,
      color: theme.colors.text,
      fontWeight: '500',
    },

    // ── Button ──
    btnWrap: { marginTop: 4, marginBottom: 10 },
    btn: {
      backgroundColor: stylesVars.accent,
      width: '100%',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8,
      paddingVertical: btnPadV,
      borderRadius: 14,
    },
    btnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
    createRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    createMuted: { fontSize: 12, fontWeight: '600', color: theme.colors.mutedText, marginTop: 11, },
    createLink: { fontSize: 12, fontWeight: '800', color: stylesVars.accent, marginTop: 11, },

    // ── Secure note ──
    secureRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 5, marginTop: 11,
    },
    secureTxt: { fontSize: 11, fontWeight: '600', color: theme.colors.mutedText },

    // ── Footer ──
    footer: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 20,
      paddingTop: 12,
      marginBottom: 10,
    },
    footerHintTxt: { fontSize: 12, fontWeight: '600', color: stylesVars.accent },
  });
}