import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getSettingsColors, settingsSpacing } from '../../ui/settingsTheme';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * PlaceholderScreen
 *
 * Lightweight placeholder for routes referenced by Settings.
 */
export default function PlaceholderScreen(props: { title: string; subtitle?: string }) {
  const { title, subtitle } = props;
  const { mode } = useTheme();
  const colors = getSettingsColors();
  const styles = React.useMemo(() => makeStyles(colors), [mode]);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof getSettingsColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background, padding: settingsSpacing.screen, justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'center' },
    sub: { marginTop: 8, fontSize: 13, fontWeight: '700', color: colors.subText, textAlign: 'center' },
  });
}

