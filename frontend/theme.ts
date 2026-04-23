import { Dimensions } from 'react-native';
import { darkTheme, lightTheme } from './theme/themes';

const { width } = Dimensions.get('window');

const scale = Math.min(Math.max(width / 390, 0.86), 1.18);

const ms = (value: number) => Math.round(value * scale);

export const theme = {
  colors: {
    ...lightTheme.colors,
  },
  spacing: {
    xs: ms(6),
    sm: ms(10),
    md: ms(14),
    lg: ms(18),
    xl: ms(24),
  },
  radius: {
    sm: ms(10),
    md: ms(14),
    lg: ms(18),
    xl: ms(22),
    pill: 999,
  },
  text: {
    xs: ms(12),
    sm: ms(14),
    md: ms(16),
    lg: ms(18),
    xl: ms(22),
    xxl: ms(28),
  },
  shadow: {
    card: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
  },
  ms,
};

export type AppTheme = typeof theme;

export type ThemeMode = 'light' | 'dark';

/**
 * Apply theme mode by mutating the shared `theme` object.
 * This keeps backward compatibility with existing `import { theme }` usage.
 */
export function applyThemeMode(mode: ThemeMode) {
  const next = mode === 'dark' ? darkTheme.colors : lightTheme.colors;
  // Mutate in place so existing imports see updated values on re-render.
  Object.assign(theme.colors, next);
}
