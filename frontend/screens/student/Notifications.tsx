import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, Platform, TouchableOpacity,
} from 'react-native';
import { useAppStore, type NotificationCategory } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import {
  formatDistanceToNow, isToday, isYesterday, format,
} from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import { CATEGORY_META, resolveNotificationCategory } from '../../constants/notificationCategoryUi';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type RowItem = {
  id: string;
  title: string;
  message: string;
  date: string;
  isSystem: boolean;
  category: NotificationCategory;
  isNew: boolean;
};

function timeLabel(dateStr: string): string {
  const d = new Date(dateStr);
  try {
    if (isToday(d))     return formatDistanceToNow(d, { addSuffix: true });
    if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`;
    return format(d, 'dd MMM · h:mm a');
  } catch { return ''; }
}

export default function StudentNotifications() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const currentUser        = useAppStore((s) => s.currentUser);
  const notifications      = useAppStore((s) => s.notifications);
  const users              = useAppStore((s) => s.users);
  const fetchNotifications = useAppStore((s) => s.fetchNotifications);
  const getStudentNotifs   = useAppStore((s) => s.getStudentNotifications);
  const markNotifsRead     = useAppStore((s) => s.markNotifsRead);
  const lastNotifSeenAt    = useAppStore((s) => s.lastNotifSeenAt);
  const scrollBottom       = useScrollBottomForTabBar();

  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setRefreshing(true);
    try { await fetchNotifications(currentUser.id); }
    finally { setRefreshing(false); }
  }, [currentUser, fetchNotifications]);

  useFocusEffect(
    useCallback(() => {
      if (currentUser) {
        fetchNotifications(currentUser.id);
        markNotifsRead();
      }
    }, [currentUser, fetchNotifications, markNotifsRead])
  );

  const cutoff = lastNotifSeenAt ? new Date(lastNotifSeenAt).getTime() : 0;

  const rows: RowItem[] = useMemo(() => {
    if (!currentUser) return [];
    return [...getStudentNotifs(currentUser.id)]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((n): RowItem => {
        const isSystem = n.id.startsWith('sys-');
        return {
          id: n.id,
          title: n.title,
          message: n.message,
          date: n.date,
          isSystem,
          category: resolveNotificationCategory(n.category, isSystem),
          isNew: !isSystem && new Date(n.date).getTime() > cutoff,
        };
      });
  }, [currentUser, getStudentNotifs, notifications, users, cutoff]);

  if (!currentUser) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: scrollBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
        ListHeaderComponent={null}
        renderItem={({ item }) => {
          const meta   = CATEGORY_META[item.category];
          const isOpen = expanded.has(item.id);

          return (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => toggleExpand(item.id)}
              style={[styles.card, item.isNew && styles.cardNew]}
            >
              {/* Colored top stripe for new notifications */}
              {item.isNew && <View style={[styles.newStripe, { backgroundColor: meta.color }]} />}

              <View style={styles.cardInner}>
                {/* Icon */}
                <View style={[styles.iconBox, { backgroundColor: meta.bg }]}>
                  <Ionicons name={item.isSystem ? 'alert-circle' : meta.icon} size={22} color={item.isSystem ? theme.colors.warning : meta.color} />
                </View>

                {/* Body */}
                <View style={styles.body}>
                  <View style={styles.bodyTop}>
                    <View style={styles.bodyTopLeft}>
                      <View style={[styles.catTag, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.catTagTxt, { color: meta.color }]}>
                          {item.isSystem ? 'Alert' : meta.short}
                        </Text>
                      </View>
                      {item.isNew && <View style={styles.blueDot} />}
                    </View>
                    <Text style={styles.time}>{timeLabel(item.date)}</Text>
                  </View>

                  <Text
                    style={[styles.title, item.isNew && styles.titleNew]}
                    numberOfLines={isOpen ? undefined : 1}
                  >
                    {item.title}
                  </Text>

                  <Text
                    style={styles.message}
                    numberOfLines={isOpen ? undefined : 2}
                  >
                    {item.message}
                  </Text>

                  {item.message.length > 80 && (
                    <Text style={[styles.readMore, { color: meta.color }]}>
                      {isOpen ? 'Show less ↑' : 'Read more ↓'}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconRing}>
              <Ionicons name="notifications-off-outline" size={36} color={theme.colors.mutedText} />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>Library announcements and reminders will appear here.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },

  // ── Card ──
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...Platform.select({
      ios:     { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  cardNew:    { borderColor: theme.colors.primary },
  newStripe:  { height: 3 },
  cardInner:  { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },

  // Icon
  iconBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Body
  body:        { flex: 1, minWidth: 0 },
  bodyTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bodyTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catTag:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  catTagTxt:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  blueDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.primary },
  time:        { fontSize: 11, fontWeight: '500', color: theme.colors.mutedText },
  title:       { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 4, lineHeight: 20 },
  titleNew:    { fontWeight: '800', color: theme.colors.text },
  message:     { fontSize: 13, color: theme.colors.mutedText, lineHeight: 19 },
  readMore:    { fontSize: 12, fontWeight: '700', marginTop: 6 },

  // ── Separator ──
  sep: { height: 8 },

  // ── Empty ──
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyIconRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: theme.colors.mutedText, textAlign: 'center', lineHeight: 20 },
});
}
