/**
 * Settings UI theme (centralized)
 *
 * Uses global `theme` colors (light/dark) so Settings follows app theme.
 */

import { theme } from '../theme';

export function getSettingsColors() {
  return {
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    subText: theme.colors.mutedText,
    border: theme.colors.border,
    danger: theme.colors.danger,
  };
}

export const settingsSpacing = {
  screen: 16,
  card: 16,
  sectionGap: 22, // 20–24px target
  itemGap: 12,
};

export const settingsRadius = {
  card: 18,
  pill: 999,
};

export const settingsShadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
};

