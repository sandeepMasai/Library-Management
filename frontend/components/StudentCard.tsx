import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, format } from 'date-fns';
import { User, FeeStatus } from '../store';
import { useAppStore } from '../store';
import { theme } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

interface StudentCardProps {
  student: User;
  onEdit: () => void;
  onBlock: () => void;
  onDelete: () => void;
}

export default function StudentCard({ student, onEdit, onBlock, onDelete }: StudentCardProps) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const currentUser = useAppStore((s) => s.currentUser);
  const daysLeft = differenceInDays(new Date(student.expiryDate), new Date());
  const isExpired = daysLeft < 0;
  const isActive = !isExpired && !student.isBlocked;
  const libraryName =
    currentUser?.role === 'library'
      ? currentUser.name || currentUser.ownerName || 'Library'
      : null;
  const libraryLogo = currentUser?.role === 'library' ? currentUser.logoUrl : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onEdit} activeOpacity={0.85}>
      {/* ── Header: photo + name + status ── */}
      <View style={styles.header}>
        <PhotoAvatar name={student.name} photoUrl={student.photoUrl} isBlocked={student.isBlocked} />

        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {student.name}
            </Text>
            <StatusBadge isActive={isActive} isBlocked={student.isBlocked} isExpired={isExpired} />
          </View>
          <Text style={styles.username} numberOfLines={1}>
            @{student.username}
          </Text>
          {libraryName ? (
            <View style={styles.libraryRow}>
              {libraryLogo ? (
                <Image source={{ uri: libraryLogo }} style={styles.libraryLogo} />
              ) : (
                <View style={styles.libraryLogoFallback}>
                  <Text style={styles.libraryLogoTxt}>{libraryName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.libraryName} numberOfLines={1}>
                {libraryName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Detail rows ── */}
      <View style={styles.details}>
        <DetailRow icon="call-outline" value={student.mobile} />
        <View style={styles.dateRow}>
          <DetailRow icon="calendar-outline" label="From" value={format(new Date(student.joinDate), 'dd MMM yyyy')} flex />
          <View style={styles.dateDivider} />
          <DetailRow icon="calendar-outline" label="To" value={format(new Date(student.expiryDate), 'dd MMM yyyy')} flex />
        </View>
        <DetailRow
          icon="time-outline"
          value={isExpired ? 'Membership expired' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`}
          color={isExpired ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#10B981'}
          bold
        />
        <View style={styles.feeRow}>
          <DetailRow icon="cash-outline" label="Fee" value={`₹${student.feeAmount}`} flex />
          <FeeBadge status={student.feeStatus} />
        </View>
      </View>

      {/* ── Action buttons ── */}
      <View style={styles.actions}>
        <ActionBtn icon="create-outline" label="Edit" color={theme.colors.primary} bg="#EEF2FF" onPress={onEdit} />
        <ActionBtn
          icon={student.isBlocked ? 'lock-open-outline' : 'lock-closed-outline'}
          label={student.isBlocked ? 'Unblock' : 'Block'}
          color={student.isBlocked ? '#059669' : '#DC2626'}
          bg={student.isBlocked ? '#DCFCE7' : '#FEF2F2'}
          onPress={onBlock}
        />
        <ActionBtn icon="trash-outline" label="Delete" color="#DC2626" bg="#FEF2F2" onPress={onDelete} />
      </View>
    </TouchableOpacity>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PhotoAvatar({
  name,
  photoUrl,
  isBlocked,
}: {
  name: string;
  photoUrl?: string | null;
  isBlocked: boolean;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={styles.photo} />;
  }
  return (
    <View style={[styles.avatar, isBlocked && styles.avatarBlocked]}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function StatusBadge({
  isActive,
  isBlocked,
  isExpired,
}: {
  isActive: boolean;
  isBlocked: boolean;
  isExpired: boolean;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  if (isBlocked) {
    return (
      <View style={[styles.badge, styles.badgeBlocked]}>
        <View style={[styles.badgeDot, { backgroundColor: theme.colors.danger }]} />
        <Text style={[styles.badgeText, { color: theme.colors.danger }]}>Blocked</Text>
      </View>
    );
  }
  if (isExpired) {
    return (
      <View style={[styles.badge, styles.badgeExpired]}>
        <View style={[styles.badgeDot, { backgroundColor: theme.colors.warning }]} />
        <Text style={[styles.badgeText, { color: theme.colors.warning }]}>Expired</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeActive]}>
      <View style={[styles.badgeDot, { backgroundColor: theme.colors.success }]} />
      <Text style={[styles.badgeText, { color: theme.colors.success }]}>Active</Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  color,
  bold,
  flex,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  value: string;
  color?: string;
  bold?: boolean;
  flex?: boolean;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <View style={[styles.detailRow, flex && { flex: 1 }]}>
      <Ionicons name={icon} size={14} color={color ?? theme.colors.mutedText} style={styles.detailIcon} />
      {label ? <Text style={styles.detailLabel}>{label}: </Text> : null}
      <Text
        style={[styles.detailValue, bold && styles.detailBold, color ? { color } : undefined]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function FeeBadge({ status }: { status: FeeStatus }) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  const map: Record<FeeStatus, { bg: string; text: string }> = {
    Paid: { bg: 'rgba(34,197,94,0.18)', text: theme.colors.success },
    'Half Paid': { bg: 'rgba(245,158,11,0.18)', text: theme.colors.warning },
    Pending: { bg: 'rgba(239,68,68,0.18)', text: theme.colors.danger },
  };
  const c = map[status] ?? map.Pending;
  return (
    <View style={[styles.feeBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.feeBadgeText, { color: c.text }]}>{status}</Text>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  bg,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

function makeStyles() {
  return StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadow.card,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    paddingBottom: 12,
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBlocked: { backgroundColor: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.35)' },
  avatarText: { fontSize: 22, fontWeight: '800', color: theme.colors.primary },
  headerInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
  username: { marginTop: 3, fontSize: 13, fontWeight: '600', color: theme.colors.mutedText },
  libraryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  libraryLogo: { width: 18, height: 18, borderRadius: 6, backgroundColor: theme.colors.background },
  libraryLogoFallback: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryLogoTxt: { fontSize: 11, fontWeight: '900', color: theme.colors.primary },
  libraryName: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText },

  // Status badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeActive: { backgroundColor: 'rgba(34,197,94,0.18)' },
  badgeExpired: { backgroundColor: 'rgba(245,158,11,0.18)' },
  badgeBlocked: { backgroundColor: 'rgba(239,68,68,0.18)' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  // Details
  details: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: theme.colors.border, marginHorizontal: 8 },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailIcon: { marginRight: 6 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.mutedText },
  detailValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  detailBold: { fontWeight: '800' },
  feeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  feeBadgeText: { fontSize: 11, fontWeight: '800' },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: { fontSize: 12, fontWeight: '800' },
});
}
