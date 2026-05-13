import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useAppStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import { theme } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

export default function AdminNotifications() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [titleFocus, setTitleFocus] = useState(false);
  const [msgFocus, setMsgFocus] = useState(false);

  const notifications = useAppStore((s) => s.notifications);
  const fetchNotificationsPage = useAppStore((s) => s.fetchNotificationsPage);
  const sendNotification = useAppStore((s) => s.sendNotification);
  const scrollBottom = useScrollBottomForTabBar();

  // Pagination state (avoid loading all data)
  const [page, setPage] = useState(1);
  const limit = 20;
  const [pageItems, setPageItems] = useState<typeof notifications>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasNext, setHasNext] = useState(false);

  const loadPage = useCallback(async (p: number) => {
    setPageLoading(true);
    try {
      const list = await fetchNotificationsPage(p, limit);
      setPageItems(list);
      setHasNext(list.length === limit);
      setPage(p);
    } finally {
      setPageLoading(false);
    }
  }, [fetchNotificationsPage]);

  useEffect(() => { loadPage(1); }, [loadPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadPage(page); } finally { setRefreshing(false); }
  }, [loadPage, page]);

  const handleSend = async () => {
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      Alert.alert('Missing details', 'Please enter a title and message.');
      return;
    }
    setSending(true);
    try {
      const result = await sendNotification(t, m, 'all', 'general');
      if (!result.ok) {
        Alert.alert('Could not send', result.message || 'Please try again.');
        return;
      }
      setTitle('');
      setMessage('');
      Alert.alert('✓ Sent', 'Notification delivered to all students.');
    } finally {
      setSending(false);
    }
  };

  const sorted = [...pageItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const ListHeader = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerIcon}>
          <Ionicons name="megaphone" size={20} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Send Notification</Text>
          <Text style={styles.pageSub}>Broadcast a message to all students</Text>
        </View>
      </View>

      {/* Compose card */}
      <View style={styles.card}>
        {/* Title */}
        <Text style={styles.fieldLabel}>Title / Reason</Text>
        <View style={[styles.inputWrap, titleFocus && styles.inputWrapFocus]}>
          <Ionicons
            name="create-outline" size={16}
            color={titleFocus ? theme.colors.primary : theme.colors.mutedText}
            style={{ marginRight: 8 }}
          />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Library closed tomorrow"
            placeholderTextColor={theme.colors.mutedText}
            style={styles.textInput}
            onFocus={() => setTitleFocus(true)}
            onBlur={() => setTitleFocus(false)}
            returnKeyType="next"
          />
        </View>

        {/* Message */}
        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Message</Text>
        <View style={[styles.inputWrap, styles.textAreaWrap, msgFocus && styles.inputWrapFocus]}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Type your message here…"
            placeholderTextColor={theme.colors.mutedText}
            style={[styles.textInput, styles.textArea]}
            multiline
            textAlignVertical="top"
            onFocus={() => setMsgFocus(true)}
            onBlur={() => setMsgFocus(false)}
          />
        </View>

        {/* Send button */}
        <Pressable
          onPress={handleSend}
          disabled={sending}
          style={({ pressed }) => [
            styles.sendBtn,
            pressed && !sending && { opacity: 0.88 },
            sending && { opacity: 0.6 },
          ]}
        >
          {sending
            ? <ActivityIndicator color={theme.colors.dark} size="small" />
            : <>
              <Ionicons name="send" size={16} color={theme.colors.dark} />
              <Text style={styles.sendBtnTxt}>Send to all students</Text>
            </>
          }
        </Pressable>
      </View>

      {/* History header */}
      {sorted.length > 0 && (
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Sent history</Text>
          <Text style={styles.historyCount}>{sorted.length} · last 30 days</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.historyCard}>
            <View style={styles.cardRow}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="notifications-outline" size={16} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardDate}>
                  {format(new Date(item.date), 'MMM d, yyyy · h:mm a')}
                </Text>
              </View>
              <View style={styles.allBadge}>
                <Ionicons name="people-outline" size={11} color={theme.colors.primary} />
                <Text style={styles.allBadgeTxt}>All</Text>
              </View>
            </View>
            <Text style={styles.cardMsg}>{item.message}</Text>
          </View>
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: scrollBottom + 20 }]}
        refreshing={refreshing}
        onRefresh={onRefresh}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View style={styles.pager}>
            <Pressable
              onPress={() => loadPage(Math.max(1, page - 1))}
              disabled={page === 1 || pageLoading}
              style={({ pressed }) => [
                styles.pagerBtn,
                (page === 1 || pageLoading) && styles.pagerBtnDisabled,
                pressed && !(page === 1 || pageLoading) && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="chevron-back" size={18} color={page === 1 ? theme.colors.mutedText : theme.colors.text} />
              <Text style={[styles.pagerTxt, page === 1 && { color: theme.colors.mutedText }]}>Prev</Text>
            </Pressable>

            <Text style={styles.pagerMid}>
              {pageLoading ? 'Loading…' : `Page ${page}`}
            </Text>

            <Pressable
              onPress={() => loadPage(page + 1)}
              disabled={!hasNext || pageLoading}
              style={({ pressed }) => [
                styles.pagerBtn,
                (!hasNext || pageLoading) && styles.pagerBtnDisabled,
                pressed && !(!hasNext || pageLoading) && { opacity: 0.9 },
              ]}
            >
              <Text style={[styles.pagerTxt, !hasNext && { color: theme.colors.mutedText }]}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={!hasNext ? theme.colors.mutedText : theme.colors.text} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={44} color={theme.colors.mutedText} />
            <Text style={styles.emptyTxt}>No notifications sent yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    listContent: { paddingHorizontal: 16, paddingTop: 12 },

    // Page header
    pageHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginTop: 40,
      marginBottom: 18,
    },
    headerIcon: {
      width: 44, height: 44, borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    pageTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
    pageSub: { fontSize: 13, fontWeight: '500', color: theme.colors.mutedText, marginTop: 2 },

    // Compose card
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      padding: 18,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...Platform.select({
        ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16 },
        android: { elevation: 2 },
      }),
    },
    fieldLabel: {
      fontSize: 12, fontWeight: '700',
      color: theme.colors.mutedText, letterSpacing: 0.5,
      textTransform: 'uppercase', marginBottom: 8,
    },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderColor: theme.colors.border,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: theme.colors.background,
    },
    inputWrapFocus: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    textAreaWrap: {
      alignItems: 'flex-start',
      minHeight: 110,
      paddingVertical: 12,
    },
    textInput: {
      flex: 1, fontSize: 15, color: theme.colors.text, fontWeight: '500',
    },
    textArea: {
      minHeight: 90,
      lineHeight: 22,
    },
    sendBtn: {
      marginTop: 20,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10,
      backgroundColor: theme.colors.primary,
      paddingVertical: 15,
      borderRadius: 14,
    },
    sendBtnTxt: { fontSize: 16, fontWeight: '800', color: theme.colors.dark },

    // History
    historyHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12,
    },
    historyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
    historyCount: { fontSize: 13, fontWeight: '600', color: theme.colors.mutedText },

    historyCard: {
      backgroundColor: theme.colors.surface, borderRadius: 14,
      padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: theme.colors.border,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    cardIconWrap: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
    cardDate: { fontSize: 11, fontWeight: '500', color: theme.colors.mutedText, marginTop: 2 },
    allBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: theme.colors.background, paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    allBadgeTxt: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
    cardMsg: { fontSize: 13, color: theme.colors.mutedText, lineHeight: 20 },

    // Empty
    empty: { alignItems: 'center', paddingVertical: 40 },
    emptyTxt: { marginTop: 10, fontSize: 15, fontWeight: '600', color: theme.colors.mutedText },

    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    },
    pagerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    pagerBtnDisabled: { opacity: 0.6 },
    pagerTxt: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
    pagerMid: { fontSize: 12, fontWeight: '800', color: theme.colors.mutedText },
  });
}
