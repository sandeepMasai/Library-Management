import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { apiPost, type ApiError } from '../../services/api';
import { theme } from '../../theme';
import { useAppStore, type User } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';

type RegisterLibraryResponse = {
  user: User;
  authToken: string;
  libraryCode?: string;
};

/**
 * RegisterLibraryScreen
 * - UI: kept consistent with existing Login screen (same card + gradient feel).
 * - Connection: POST /api/auth/register-library using central Axios service.
 * - On success: store token + role + libraryId (tenant) and navigate to Library dashboard.
 */
export default function RegisterLibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);

  const [libraryName, setLibraryName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(
      libraryName.trim() &&
        ownerName.trim() &&
        city.trim() &&
        email.trim() &&
        password.trim()
    );
  }, [libraryName, ownerName, city, email, password]);

  const onSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!canSubmit) {
      Alert.alert('Required', 'Please fill all fields.');
      return;
    }

    setLoading(true);
    try {
      /**
       * Backend connection:
       * POST /api/auth/register-library
       * Body: { libraryName, ownerName, email, password, city }
       */
      const data = await apiPost<RegisterLibraryResponse>(`/api/auth/register-library`, {
        libraryName: libraryName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        city: city.trim(),
      });

      // Store required auth fields (persist middleware will save them):
      // - token
      // - role
      // - libraryId (tenant) = library user id
      useAppStore.setState((s) => ({
        currentUser: data.user,
        authToken: data.authToken,
        token: data.authToken,
        role: 'library',
        libraryId: data.user.id,
        libraryCode: data.user.libraryCode ?? data.libraryCode ?? s.libraryCode ?? null,
        users: [s.users[0], data.user, ...s.users.filter((u) => u.id !== data.user.id && u.role === 'student')],
      }));

      // Redirect to Library dashboard
      if (Platform.OS === 'web') {
        // web deep-link path (react-navigation linking)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Linking } = require('react-native');
        Linking.openURL('/dashboard');
      } else {
        navigation.navigate('LibraryRoot');
      }
    } catch (e: any) {
      const err = e as ApiError;
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0F766E', '#0D9488', '#14B8A6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.secureLabel}>CREATE LIBRARY</Text>
        <Text style={styles.brandName}>Register</Text>
        <Text style={styles.brandTagline}>Start your library workspace in minutes.</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Library details</Text>

              <Field
                label="LIBRARY NAME"
                icon="business-outline"
                value={libraryName}
                onChangeText={setLibraryName}
                placeholder="e.g. PRITAN Library"
              />
              <Field
                label="OWNER NAME"
                icon="person-outline"
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="e.g. Sandeep"
              />
              <Field label="CITY" icon="location-outline" value={city} onChangeText={setCity} placeholder="e.g. Pune" />
              <Field
                label="EMAIL"
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                placeholder="owner@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={styles.fieldRow}>
                  <Ionicons name="lock-closed-outline" size={18} color={stylesVars.icon} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create a strong password"
                    placeholderTextColor={theme.colors.mutedText}
                    style={[styles.input, { flex: 1 }]}
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={onSubmit}
                  />
                  <TouchableOpacity onPress={() => setShowPass((p) => !p)} hitSlop={8}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={stylesVars.icon} />
                  </TouchableOpacity>
                </View>
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
                  <Text style={styles.errorTxt}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={onSubmit}
                activeOpacity={0.9}
                style={[styles.loginBtn, !canSubmit && { opacity: 0.6 }]}
                disabled={!canSubmit || loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnTxt}>Create Library</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
                style={{ marginTop: 14, alignItems: 'center' }}
              >
                <Text style={styles.backToLogin}>Back to login</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(props: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <View style={styles.fieldRow}>
        <Ionicons name={props.icon} size={18} color={stylesVars.icon} />
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          autoCorrect={false}
          keyboardType={props.keyboardType}
          autoCapitalize={props.autoCapitalize}
        />
      </View>
    </View>
  );
}

const stylesVars = {
  icon: '#94A3B8',
};

function makeStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  hero: {
    height: 220,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    justifyContent: 'flex-end',
    paddingBottom: 18,
  },
  secureLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.75)',
  },
  brandName: { marginTop: 8, fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  brandTagline: { marginTop: 6, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  scroll: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 26 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 12 },
  fieldWrap: { marginTop: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.mutedText, letterSpacing: 1.1, marginBottom: 8 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  loginBtn: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  loginBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  backToLogin: { color: theme.colors.primary, fontWeight: '900' },
  errorBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  errorTxt: { flex: 1, color: theme.colors.mutedText, fontWeight: '800', fontSize: 12 },
});
}

