import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, type ApiError } from './api';

export type GlobalSettings = {
  privacyPolicyUrl: string;
  termsUrl: string;
  communication: { whatsapp: string; channel: string; email: string };
  updatedAt: string | null;
};

type GlobalSettingsDto = {
  ok: boolean;
  settings: GlobalSettings;
};

const STORAGE_KEY = 'global_settings_v1';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

let mem:
  | {
      settings: GlobalSettings;
      fetchedAt: number;
    }
  | null = null;

export async function getGlobalSettings(opts?: { force?: boolean }): Promise<GlobalSettings> {
  const force = Boolean(opts?.force);
  const now = Date.now();

  if (!force && mem && now - mem.fetchedAt < TTL_MS) return mem.settings;

  if (!force && !mem) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { settings: GlobalSettings; fetchedAt: number };
        if (cached?.settings && typeof cached.fetchedAt === 'number' && now - cached.fetchedAt < TTL_MS) {
          mem = cached;
          return cached.settings;
        }
      }
    } catch {
      // ignore cache read errors
    }
  }

  const data = await apiGet<GlobalSettingsDto>('/api/settings');
  const settings = {
    privacyPolicyUrl: String(data.settings?.privacyPolicyUrl || '').trim(),
    termsUrl: String(data.settings?.termsUrl || '').trim(),
    communication: {
      whatsapp: String((data.settings as any)?.communication?.whatsapp || '').trim(),
      channel: String((data.settings as any)?.communication?.channel || '').trim(),
      email: String((data.settings as any)?.communication?.email || '').trim(),
    },
    updatedAt: data.settings?.updatedAt ?? null,
  };

  mem = { settings, fetchedAt: now };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
  } catch {
    // ignore cache write errors
  }
  return settings;
}

export function isValidHttpUrl(input: string) {
  try {
    const u = new URL(String(input || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function toApiErrorMessage(e: unknown) {
  const err = e as ApiError;
  return err?.message || 'Request failed';
}

