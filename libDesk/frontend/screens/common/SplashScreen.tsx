import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';

const BRAND_LOGO = require('../../assets/logo.png');

type TargetRoute = 'AdminRoot' | 'LibraryRoot' | 'StudentRoot' | 'Login';

function resolveTarget(role: string | null | undefined): TargetRoute {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'admin') return 'AdminRoot';
  if (r === 'library') return 'LibraryRoot';
  if (r === 'student') return 'StudentRoot';
  return 'Login';
}

export default function SplashScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  const token = useAppStore((s) => s.token);
  const role = useAppStore((s) => s.role);
  const fetchMyProfile = useAppStore((s) => s.fetchMyProfile);
  const logout = useAppStore((s) => s.logout);

  const isTablet = Math.min(width, height) >= 768;
  const logoSize = isTablet ? 92 : Math.min(78, Math.max(64, Math.round(width * 0.18)));

  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.92)).current;
  const floatY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // Smooth, premium intro: fade + scale + subtle float.
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -3, duration: 900, useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 3, duration: 900, useNativeDriver: true }),
        ])
      ),
    ]).start();

    return () => floatY.stopAnimation();
  }, [floatY, opacity, scale]);

  React.useEffect(() => {
    let cancelled = false;

    async function boot() {
      // Keep splash visible for a consistent startup experience.
      await new Promise((r) => setTimeout(r, 5000));
      if (cancelled) return;

      if (!token) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      // Hydrate currentUser (so protected route guards + UI have the latest profile).
      const target = resolveTarget(role);
      const res = await fetchMyProfile();
      if (cancelled) return;

      if (!res?.ok) {
        logout();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: target }] });
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [fetchMyProfile, logout, navigation, role, token]);

  const styles = makeStyles(theme, isTablet, logoSize);

  // Keep background consistent with modern SaaS: light gradient + subtle glow.
  return (
    <LinearGradient
      colors={['#ffffff', '#F6FFFE', '#ECFDFB']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.logoShell,
            {
              opacity,
              transform: [{ translateY: floatY }, { scale }],
            },
          ]}
        >
          <Animated.Image
            source={BRAND_LOGO}
            resizeMode="contain"
            style={{ width: logoSize, height: logoSize }}
            accessibilityLabel="Library Manager"
          />
        </Animated.View>

        <Animated.Text style={[styles.brandName, { opacity }]}>Library Manager</Animated.Text>
        <Animated.Text style={[styles.tagline, { opacity }]}>Modern library operations, simplified.</Animated.Text>

        <View style={styles.loaderRow} accessibilityRole="progressbar" accessibilityLabel="Loading">
          <ActivityIndicator
            size={Platform.OS === 'ios' ? 'small' : 'small'}
            color={theme.colors.primary}
          />
          <Text style={styles.loadingTxt}>Checking session…</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function makeStyles(uiTheme: any, isTablet: boolean, logoSize: number) {
  const titleSize = isTablet ? 34 : 26;
  const taglineSize = isTablet ? 14 : 12;
  const pad = isTablet ? 28 : 18;
  const shell = Math.round(logoSize * 1.35);

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: uiTheme.colors.background,
    },
    center: {
      flex: 1,
      paddingHorizontal: pad,
      justifyContent: 'center',
      alignItems: 'center',
    },
    logoShell: {
      width: shell,
      height: shell,
      borderRadius: Math.round(shell * 0.28),
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(15,118,110,0.10)',
      ...(Platform.OS === 'ios'
        ? {
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.10,
            shadowRadius: 22,
          }
        : { elevation: 6 }),
    },
    brandName: {
      marginTop: 18,
      fontSize: titleSize,
      fontWeight: '900',
      color: uiTheme.colors.text,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    tagline: {
      marginTop: 6,
      fontSize: taglineSize,
      fontWeight: '600',
      color: uiTheme.colors.mutedText,
      textAlign: 'center',
      maxWidth: 420,
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(15,118,110,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(15,118,110,0.10)',
    },
    loadingTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: uiTheme.colors.text,
      opacity: 0.85,
    },
  });
}

