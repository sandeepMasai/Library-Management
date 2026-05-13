import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, type ApiError } from './api';

export type LibraryContact = {
  libraryName: string;
  communication: {
    whatsapp: string; // digits only (with country code)
    channel: string; // url
    email: string;
  };
};

type LibraryProfileDto = {
  ok: boolean;
  profile: { libraryName: string; communication?: any };
};

const STORAGE_KEY = 'library_contact_v1';
const TTL_MS = 10 * 60 * 1000;

let mem: { contact: LibraryContact; fetchedAt: number } | null = null;

export function normalizeWhatsAppNumber(input: string) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  if (!/^\d{10,15}$/.test(normalized)) return '';
  return normalized;
}

export async function getLibraryContact(opts?: { force?: boolean }): Promise<LibraryContact> {
  const force = Boolean(opts?.force);
  const now = Date.now();

  if (!force && mem && now - mem.fetchedAt < TTL_MS) return mem.contact;

  if (!force && !mem) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { contact: LibraryContact; fetchedAt: number };
        if (cached?.contact && typeof cached.fetchedAt === 'number' && now - cached.fetchedAt < TTL_MS) {
          mem = cached;
          return cached.contact;
        }
      }
    } catch {
      // ignore
    }
  }

  const data = await apiGet<LibraryProfileDto>('/api/library/profile');
  const contact: LibraryContact = {
    libraryName: String(data.profile?.libraryName || 'Library'),
    communication: {
      whatsapp: normalizeWhatsAppNumber(String(data.profile?.communication?.whatsapp || '')),
      channel: String(data.profile?.communication?.channel || '').trim(),
      email: String(data.profile?.communication?.email || '').trim(),
    },
  };

  mem = { contact, fetchedAt: now };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
  } catch {
    // ignore
  }
  return contact;
}

export function toApiErrorMessage(e: unknown) {
  const err = e as ApiError;
  return err?.message || 'Request failed';
}

