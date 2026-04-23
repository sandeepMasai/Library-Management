import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  variant?: 'primary' | 'secondary';
}

export default function AppButton({ title, onPress, style, variant = 'primary' }: AppButtonProps) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, isPrimary ? styles.primary : styles.secondary, style]}
      activeOpacity={0.88}
    >
      <Text style={[styles.text, isPrimary ? styles.textPrimary : styles.textSecondary]}>{title}</Text>
    </TouchableOpacity>
  );
}

function makeStyles() {
  return StyleSheet.create({
    button: {
      minHeight: 52,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
    },
    primary: {
      backgroundColor: theme.colors.primary,
    },
    secondary: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    text: {
      fontSize: theme.text.md,
      fontWeight: '700',
    },
    textPrimary: {
      color: '#fff',
    },
    textSecondary: {
      color: theme.colors.text,
    },
  });
}
