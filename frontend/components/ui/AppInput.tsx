import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

interface AppInputProps extends TextInputProps {
  icon?: React.ReactNode;
}

export default function AppInput({ icon, style, ...props }: AppInputProps) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={styles.container}>
      {icon}
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.mutedText}
        style={[styles.input, style]}
      />
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    container: {
      minHeight: 54,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
    },
    input: {
      flex: 1,
      fontSize: theme.text.md,
      color: theme.colors.text,
    },
  });
}
