import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, format } from 'date-fns';
import { User, FeeStatus } from '../store';

interface LibraryCardProps {
  user: User;
  onPhotoPress?: () => void;
  uploadingPhoto?: boolean;
}

export default function LibraryCard({
  user,
  onPhotoPress,
  uploadingPhoto = false,
}: LibraryCardProps) {
  const daysLeft = differenceInDays(new Date(user.expiryDate), new Date());
  const isExpired = daysLeft < 0;
  const isExpiringSoon = !isExpired && daysLeft <= 7;

  const statusLabel = user.isBlocked ? 'Blocked' : isExpired ? 'Expired' : 'Active';
  const statusColor = user.isBlocked ? '#F87171' : isExpired ? '#FCD34D' : '#34D399';
  const daysColor = isExpired ? '#F87171' : isExpiringSoon ? '#FCD34D' : '#34D399';

  return (
    <LinearGradient
      colors={['#312E81', '#4338CA', '#6D28D9']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Decorative background circles */}
      <View style={[styles.circle, styles.circleTopRight]} />
      <View style={[styles.circle, styles.circleBottomLeft]} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Ionicons name="library" size={14} color="#A5B4FC" />
          <Text style={styles.brandText}>LIBDESK</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Photo + name */}
      <View style={styles.profileRow}>
        <TouchableOpacity
          onPress={onPhotoPress}
          activeOpacity={onPhotoPress ? 0.8 : 1}
          disabled={!onPhotoPress}
          style={styles.photoWrap}
        >
          {user.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.photo} />
          ) : (
            <LinearGradient
              colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.08)']}
              style={styles.avatarGrad}
            >
              <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          {onPhotoPress && (
            <View style={styles.cameraBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size={11} color="#fff" />
              ) : (
                <Ionicons name="camera" size={11} color="#fff" />
              )}
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={styles.username}>@{user.username}</Text>
          <View style={styles.mobileRow}>
            <Ionicons name="call-outline" size={12} color="#A5B4FC" />
            <Text style={styles.mobile}>{user.mobile}</Text>
          </View>
        </View>

        {/* Days left badge */}
        <View style={styles.daysWrap}>
          <Text style={[styles.daysNum, { color: daysColor }]}>
            {isExpired ? '0' : daysLeft}
          </Text>
          <Text style={styles.daysSub}>days{'\n'}left</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Date row */}
      <View style={styles.dateRow}>
        <DateChip label="ACTIVE FROM" value={format(new Date(user.joinDate), 'dd MMM yyyy')} />
        <View style={styles.dateSep} />
        <DateChip label="ACTIVE TO" value={format(new Date(user.expiryDate), 'dd MMM yyyy')} />
        <View style={styles.dateSep} />
        <DateChip label="FEE" value={user.feeStatus} valueColor={feeColor(user.feeStatus)} />
      </View>

      {/* Bottom strip */}
      <View style={styles.bottomStrip}>
        <View style={styles.stripLeft}>
          <View style={[styles.chipDot, styles.chipDotA]} />
          <View style={[styles.chipDot, styles.chipDotB]} />
          <View style={[styles.chipDot, styles.chipDotC]} />
        </View>
        <Text style={styles.stripAmount}>₹ {user.feeAmount}</Text>
        <Text style={styles.stripLabel}>LIBRARY STUDENT CARD</Text>
      </View>
    </LinearGradient>
  );
}

function DateChip({
  label,
  value,
  valueColor = '#E0E7FF',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.dateChip}>
      <Text style={styles.dateChipLabel}>{label}</Text>
      <Text style={[styles.dateChipValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function feeColor(status: FeeStatus): string {
  if (status === 'Paid') return '#34D399';
  if (status === 'Half Paid') return '#FCD34D';
  return '#F87171';
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },

  // Decorative circles
  circle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  circleTopRight: {
    width: 160,
    height: 160,
    top: -60,
    right: -40,
  },
  circleBottomLeft: {
    width: 120,
    height: 120,
    bottom: -30,
    left: -30,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A5B4FC',
    letterSpacing: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  // Profile row
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 14,
  },
  photoWrap: { position: 'relative' },
  photo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarGrad: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  cameraBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#312E81',
  },
  nameBlock: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  username: { marginTop: 3, fontSize: 13, fontWeight: '600', color: '#A5B4FC' },
  mobileRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  mobile: { fontSize: 12, fontWeight: '600', color: '#C7D2FE' },

  // Days badge
  daysWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 52,
  },
  daysNum: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  daysSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#A5B4FC',
    textAlign: 'center',
    lineHeight: 12,
    marginTop: 2,
    letterSpacing: 0.3,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 18,
  },

  // Date row
  dateRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  dateChip: { flex: 1, alignItems: 'center' },
  dateChipLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  dateChipValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E0E7FF',
    textAlign: 'center',
  },
  dateSep: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 2,
  },

  // Bottom strip
  bottomStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  stripLeft: { flexDirection: 'row', gap: 5 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipDotA: { backgroundColor: '#F87171' },
  chipDotB: { backgroundColor: '#FCD34D' },
  chipDotC: { backgroundColor: '#34D399' },
  stripAmount: { fontSize: 16, fontWeight: '800', color: '#fff' },
  stripLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 1.2,
  },
});
