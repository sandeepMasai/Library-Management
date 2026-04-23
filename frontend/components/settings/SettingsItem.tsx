import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSettingsColors } from '../../ui/settingsTheme';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * SettingsItem (reusable row)
 *
 * Props:
 * - title / subtitle
 * - icon (Ionicons name)
 * - onPress
 * - danger (optional)
 */
export default function SettingsItem(props: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  danger?: boolean;
  hideDivider?: boolean;
  iconBgColor?: string;
  iconColor?: string;
}) {
  const { title, subtitle, icon, onPress, danger = false, hideDivider = false, iconBgColor, iconColor } = props;
  const { mode } = useTheme();
  const colors = getSettingsColors();
  const styles = React.useMemo(() => makeStyles(colors, danger), [mode, danger]);
  const titleColor = danger ? colors.danger : colors.text;
  const subColor = danger ? 'rgba(220,38,38,0.75)' : colors.subText;
  const fg = danger ? colors.danger : iconColor || colors.primary;
  const bg = danger ? 'rgba(220,38,38,0.10)' : iconBgColor || 'rgba(13,148,136,0.10)';

  return (
    <View>
      <TouchableOpacity activeOpacity={0.85} style={styles.row} onPress={onPress}>
        <View style={[styles.icon, { backgroundColor: bg }]}>
          <Ionicons name={icon as any} size={18} color={fg} />
        </View>

        <View style={styles.text}>
          <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.sub, { color: subColor }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.subText} />
      </TouchableOpacity>

      {!hideDivider ? <View style={styles.divider} /> : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof getSettingsColors>, danger: boolean) {
  return StyleSheet.create({
    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { flex: 1, justifyContent: 'center' },
    title: { fontSize: 13, fontWeight: '900' },
    sub: { marginTop: 5, fontSize: 12, fontWeight: '700', lineHeight: 16 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: danger ? 'rgba(220,38,38,0.22)' : colors.border,
      marginLeft: 16 + 40 + 12,
      marginRight: 16,
    },
  });
}

