import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAppStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { differenceInDays } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { useScrollBottomForTabBar } from '../../hooks/useScrollBottomForTabBar';
import StudentCard from '../../components/StudentCard';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmModal, type ConfirmTone } from '../../components/ConfirmModal';

export default function AdminStudents() {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const users = useAppStore((s) => s.users);
  const fetchStudents = useAppStore((s) => s.fetchStudents);
  const deleteStudent = useAppStore((state) => state.deleteStudent);
  const toggleBlockStudent = useAppStore((state) => state.toggleBlockStudent);
  const navigation = useNavigation<any>();

  const [pageLoading, setPageLoading] = useState(true);
  const [infoModal, setInfoModal] = useState<{ title: string; description?: string; tone?: ConfirmTone } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    tone: ConfirmTone;
    title: string;
    description?: string;
    confirmText: string;
    confirmIcon?: keyof typeof Ionicons.glyphMap;
    loading?: boolean;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void> | void)>(null);

  const scrollBottom = useScrollBottomForTabBar();

  const parentNav = useCallback(() => navigation.getParent(), [navigation]);

  const goForm = (studentId?: string) => {
    parentNav()?.navigate('AdminStudentForm', studentId ? { studentId } : undefined);
  };

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [students]
  );

  const filteredStudents = useMemo(
    () =>
      sortedStudents.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          s.mobile.includes(searchQuery.trim()) ||
          s.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    [sortedStudents, searchQuery]
  );

  const stats = useMemo(() => {
    const active = students.filter((s) => differenceInDays(new Date(s.expiryDate), new Date()) >= 0).length;
    return { total: students.length, active };
  }, [students]);

  const loadAll = useCallback(async () => {
    setPageLoading(true);
    try {
      await fetchStudents();
    } finally {
      setPageLoading(false);
    }
  }, [fetchStudents]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const handleDelete = (id: string, name: string) => {
    setConfirmAction(() => async () => {
      setConfirmModal((c) => (c ? { ...c, loading: true } : c));
      const result = await deleteStudent(id);
      setConfirmModal(null);
      if (!result.ok) {
        setInfoModal({ title: 'Error', description: result.message || 'Could not delete student.', tone: 'danger' });
      }
    });
    setConfirmModal({
      tone: 'danger',
      title: 'Delete student?',
      description: `Remove ${name} from the library? This cannot be undone.`,
      confirmText: 'Delete',
      confirmIcon: 'trash-outline',
      loading: false,
    });
  };

  const handleBlock = (id: string, name: string, blocked: boolean) => {
    setConfirmAction(() => async () => {
      setConfirmModal((c) => (c ? { ...c, loading: true } : c));
      const result = await toggleBlockStudent(id);
      setConfirmModal(null);
      if (!result.ok) {
        setInfoModal({ title: 'Error', description: result.message || 'Could not update status.', tone: 'danger' });
      }
    });
    setConfirmModal({
      tone: blocked ? 'primary' : 'danger',
      title: blocked ? 'Unblock student?' : 'Block student?',
      description: blocked ? `Allow ${name} to use the app again?` : `Block ${name} from signing in?`,
      confirmText: blocked ? 'Unblock' : 'Block',
      confirmIcon: blocked ? 'lock-open-outline' : 'lock-closed-outline',
      loading: false,
    });
  };

  const renderStudent = ({ item }: { item: (typeof students)[0] }) => (
    <StudentCard
      student={item}
      onEdit={() => goForm(item.id)}
      onBlock={() => handleBlock(item.id, item.name, item.isBlocked)}
      onDelete={() => handleDelete(item.id, item.name)}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.flex}>
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{stats.total}</Text>
            <Text style={styles.summaryLab}>Students</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: '#059669' }]}>{stats.active}</Text>
            <Text style={styles.summaryLab}>Active</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{filteredStudents.length}</Text>
            <Text style={styles.summaryLab}>Showing</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={theme.colors.mutedText} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, username, mobile…"
            placeholderTextColor={theme.colors.mutedText}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={12}>
              <Ionicons name="close-circle" size={20} color={theme.colors.mutedText} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredStudents}
          renderItem={renderStudent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: scrollBottom + 56 + 72 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          ListHeaderComponent={
            pageLoading ? (
              <View style={styles.pageLoadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.pageLoadingTxt}>Loading…</Text>
              </View>
            ) : null
          }
          ListFooterComponent={<View style={{ height: 14 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={44} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyTitle}>
                {students.length === 0 ? 'No students yet' : 'No matches'}
              </Text>
              <Text style={styles.emptySub}>
                {students.length === 0
                  ? 'Add your first library member to see them here.'
                  : 'Try a different search term.'}
              </Text>
              {students.length === 0 && (
                <TouchableOpacity style={styles.emptyCta} onPress={() => goForm()} activeOpacity={0.9}>
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyCtaText}>Add student</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        <TouchableOpacity style={styles.fab} onPress={() => goForm()} activeOpacity={0.92} accessibilityLabel="Add student">
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={!!confirmModal}
        tone={confirmModal?.tone ?? 'neutral'}
        label="CONFIRM"
        title={confirmModal?.title ?? 'Confirm'}
        description={confirmModal?.description}
        loading={!!confirmModal?.loading}
        cancelText="Cancel"
        confirmText={confirmModal?.confirmText ?? 'Confirm'}
        confirmIcon={confirmModal?.confirmIcon}
        onCancel={() => {
          if (confirmModal?.loading) return;
          setConfirmModal(null);
          setConfirmAction(null);
        }}
        onConfirm={async () => {
          const fn = confirmAction;
          if (!fn) {
            setConfirmModal(null);
            return;
          }
          await fn();
        }}
      />

      <ConfirmModal
        visible={!!infoModal}
        tone={infoModal?.tone ?? 'neutral'}
        label={infoModal?.tone === 'danger' ? 'ERROR' : 'INFO'}
        title={infoModal?.title ?? 'Info'}
        description={infoModal?.description}
        showCancel={false}
        confirmText="OK"
        confirmIcon={infoModal?.tone === 'danger' ? 'warning' : 'checkmark-outline'}
        onCancel={() => setInfoModal(null)}
        onConfirm={() => setInfoModal(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },
    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: theme.spacing.md,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadow.card,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryVal: { fontSize: 22, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5 },
    summaryLab: { marginTop: 2, fontSize: 11, fontWeight: '700', color: theme.colors.mutedText, textTransform: 'uppercase' },
    summaryDivider: { width: 1, height: 36, backgroundColor: theme.colors.border },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    searchIcon: { marginRight: 8 },
    searchInput: {
      flex: 1,
      fontSize: theme.text.md,
      color: theme.colors.text,
      fontWeight: '600',
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    },
    list: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: 0,
    },
    pageLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6 },
    pageLoadingTxt: { fontSize: 13, fontWeight: '700', color: theme.colors.mutedText },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 100,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { marginTop: 16, fontSize: 18, fontWeight: '800', color: theme.colors.text },
    emptySub: { marginTop: 6, fontSize: 14, color: theme.colors.mutedText, textAlign: 'center', lineHeight: 20 },
    emptyCta: {
      marginTop: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
    },
    emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
