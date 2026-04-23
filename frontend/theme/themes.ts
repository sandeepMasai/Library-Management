/**
 * Light/Dark theme definitions.
 *
 * Keep shape compatible with existing `theme` usage:
 * - theme.colors.background/surface/text/mutedText/border/primary/...
 */

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  primary: string;
  success: string;
  danger: string;
  warning: string;
  dark: string;
};

export const lightTheme: { colors: ThemeColors } = {
  colors: {
    // Modern light palette:
    // - background: soft neutral (not pure white glare)
    // - surface: true white cards for depth
    background: '#F6F8FB',
    surface: '#FFFFFF',
    text: '#0F172A',
    mutedText: '#64748B',
    border: '#E6EAF0',
    primary: '#0F766E',
    success: '#059669',
    danger: '#DC2626',
    warning: '#D97706',
    dark: '#0B1220',
  },
};

export const darkTheme: { colors: ThemeColors } = {
  colors: {
    background: '#0B1B2B',
    surface: '#111827',
    text: '#FFFFFF',
    mutedText: 'rgba(255,255,255,0.72)',
    border: 'rgba(255,255,255,0.10)',
    primary: '#0D9488',
    success: '#22C55E',
    danger: '#EF4444',
    warning: '#F59E0B',
    dark: '#0B1220',
  },
};

