import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { applyThemeMode, type ResolvedThemeMode, type ThemeMode, theme } from '../theme';

type ThemeContextValue = {
  // Resolved theme mode currently applied across the app (always light|dark).
  mode: ResolvedThemeMode;
  // Saved preference (light|dark|system) shown in Appearance UI.
  preference: ThemeMode;
  theme: typeof theme;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  preference: 'light',
  theme,
  toggleTheme: () => {},
  setMode: () => {},
  hydrated: false,
});

const STORAGE_KEY = 'ui-theme-mode';

export function ThemeProvider(props: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemeMode>('light');
  const [mode, setModeState] = useState<ResolvedThemeMode>('light');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage once.
  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
        const nextPref: ThemeMode = saved === 'dark' || saved === 'system' ? saved : 'light';
        setPreference(nextPref);
        const resolved = applyThemeMode(nextPref, (systemScheme as any) || null);
        setModeState(resolved);
      } catch {
        // fallback: light
        setPreference('light');
        applyThemeMode('light', (systemScheme as any) || null);
        setModeState('light');
      } finally {
        setHydrated(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If preference is "system", follow device scheme changes.
  useEffect(() => {
    if (!hydrated) return;
    if (preference !== 'system') return;
    const resolved = applyThemeMode('system', (systemScheme as any) || null);
    setModeState(resolved);
  }, [hydrated, preference, systemScheme]);

  const setMode = useCallback(async (next: ThemeMode) => {
    setPreference(next);
    const resolved = applyThemeMode(next, (systemScheme as any) || null);
    setModeState(resolved);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, [systemScheme]);

  const toggleTheme = useCallback(() => {
    // Simple toggle between light/dark (if currently system, switch to dark).
    setMode(mode === 'light' ? 'dark' : 'light');
  }, [mode, setMode]);

  const value = useMemo(
    () => ({
      mode,
      preference,
      theme,
      toggleTheme,
      setMode,
      hydrated,
    }),
    [mode, preference, toggleTheme, setMode, hydrated]
  );

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  return ctx;
}

