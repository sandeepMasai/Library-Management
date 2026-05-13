import React from 'react';
import { View, StyleSheet } from 'react-native';
import { settingsRadius, settingsShadow, getSettingsColors } from '../../ui/settingsTheme';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * SettingsSectionCard (reusable)
 *
 * One card container per section.
 * - Wraps multiple SettingsItem rows
 * - Provides consistent border radius + shadow
 */
export default function SettingsSectionCard(props: { children: React.ReactNode }) {
  const { mode } = useTheme();
  const colors = getSettingsColors();
  const styles = React.useMemo(() => makeStyles(colors), [mode]);
  return <View style={styles.card}>{props.children}</View>;
}

function makeStyles(colors: ReturnType<typeof getSettingsColors>) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: settingsRadius.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden', // keeps dividers clipped to rounded corners
      ...settingsShadow.card,
    },
  });
}

