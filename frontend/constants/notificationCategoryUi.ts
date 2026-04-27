import { Ionicons } from '@expo/vector-icons';
import type { NotificationCategory } from '../store';

export const CATEGORY_ORDER: NotificationCategory[] = [
  'general',
  'festival',
  'closure',
  'hours',
  'rules',
  'event',
];

export const CATEGORY_META: Record<
  NotificationCategory,
  {
    label: string;
    short: string;
    color: string;
    bg: string;
    border: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  general: {
    label: 'General',
    short: 'News',
    color: '#4338CA',
    bg: '#EEF2FF',
    border: '#C7D2FE',
    icon: 'megaphone-outline',
  },
  festival: {
    label: 'Festival & wishes',
    short: 'Festival',
    color: '#B45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: 'gift-outline',
  },
  closure: {
    label: 'Closed / leave',
    short: 'Closed',
    color: '#B91C1C',
    bg: '#FEF2F2',
    border: '#FECACA',
    icon: 'ban-outline',
  },
  hours: {
    label: 'Timings',
    short: 'Hours',
    color: '#0369A1',
    bg: '#F0F9FF',
    border: '#BAE6FD',
    icon: 'time-outline',
  },
  rules: {
    label: 'Rules',
    short: 'Rules',
    color: '#6D28D9',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    icon: 'document-text-outline',
  },
  event: {
    label: 'Event',
    short: 'Event',
    color: '#047857',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'calendar-outline',
  },
};

export function resolveNotificationCategory(
  raw: string | undefined,
  isSystem: boolean
): NotificationCategory {
  if (isSystem) return 'rules';
  const allowed = new Set(CATEGORY_ORDER);
  if (raw && allowed.has(raw as NotificationCategory)) return raw as NotificationCategory;
  return 'general';
}
