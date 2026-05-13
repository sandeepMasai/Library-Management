import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type AppCardProps = ViewProps;

export default function AppCard({ style, ...props }: AppCardProps) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return <View style={[styles.card, style]} {...props} />;
}

function makeStyles() {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadow.card,
    },
  });
}
