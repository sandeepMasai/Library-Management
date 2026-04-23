import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyThemeMode, type ThemeMode, theme } from '../theme';

type ThemeContextValue = {
  mode: ThemeMode;
  theme: typeof theme;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  theme,
  toggleTheme: () => {},
  setMode: () => {},
  hydrated: false,
});

const STORAGE_KEY = 'ui-theme-mode';

export function ThemeProvider(props: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage once.
  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
        const next: ThemeMode = saved === 'dark' ? 'dark' : 'light';
        setModeState(next);
        applyThemeMode(next);
      } catch {
        // fallback: light
        applyThemeMode('light');
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    applyThemeMode(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : 'light');
  }, [mode, setMode]);

  const value = useMemo(
    () => ({
      mode,
      theme,
      toggleTheme,
      setMode,
      hydrated,
    }),
    [mode, toggleTheme, setMode, hydrated]
  );

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  return ctx;
}

