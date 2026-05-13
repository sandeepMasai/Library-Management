import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSettingsColors, settingsRadius, settingsShadow, settingsSpacing } from '../../ui/settingsTheme';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * ProfileCard (reusable)
 *
 * Shows:
 * - Avatar (initial)
 * - Name + Email
 * - PRO badge
 * - Arrow chevron
 */
export default function ProfileCard(props: {
  name: string;
  email: string;
  pro?: boolean;
  onPress?: () => void;
  imageUrl?: string | null;
  onPressAvatar?: () => void;
  onPressCamera?: () => void;
  uploading?: boolean;
}) {
  const { name, email, pro = false, onPress, imageUrl, onPressAvatar, onPressCamera, uploading = false } = props;
  const initial = String(name || 'U').trim().slice(0, 1).toUpperCase();
  const { mode } = useTheme();
  const colors = getSettingsColors();
  const styles = React.useMemo(() => makeStyles(colors), [mode]);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      {/* Avatar:
          - If imageUrl exists → show image
          - Else → show first letter initial
          Camera overlay triggers image picker/upload */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPressAvatar} style={styles.avatar}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarTxt}>{initial}</Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPressCamera}
          style={styles.cameraDot}
          accessibilityLabel="Update profile photo"
        >
          {uploading ? (
            <ActivityIndicator size={10} color={colors.text} />
          ) : (
            <Ionicons name="camera" size={12} color={colors.text} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>

        {pro ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>PRO MEMBER</Text>
          </View>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.subText} />
    </TouchableOpacity>
  );
}

function makeStyles(colors: ReturnType<typeof getSettingsColors>) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: settingsRadius.card,
      padding: settingsSpacing.card,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...settingsShadow.card,
    },
    avatar: {
      width: 60,
      height: 60,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 22, fontWeight: '900', color: colors.primary },
    cameraDot: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    center: { flex: 1, justifyContent: 'center' },
    name: { fontSize: 15, fontWeight: '900', color: colors.text },
    email: { marginTop: 3, fontSize: 12, fontWeight: '700', color: colors.subText },
    badge: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: settingsRadius.pill,
      backgroundColor: 'rgba(22,163,74,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(22,163,74,0.28)',
    },
    badgeTxt: { fontSize: 10, fontWeight: '900', color: colors.primary, letterSpacing: 0.4 },
  });
}

