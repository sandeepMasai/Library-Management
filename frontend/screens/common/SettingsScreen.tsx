import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store';
import { getSettingsColors, settingsSpacing } from '../../ui/settingsTheme';
import ProfileCard from '../../components/settings/ProfileCard';
import ProBanner from '../../components/settings/ProBanner';
import SettingsItem from '../../components/settings/SettingsItem';
import SettingsSectionCard from '../../components/settings/SettingsSectionCard';
import * as ImagePicker from 'expo-image-picker';
import { api, apiGet } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmModal } from '../../components/ConfirmModal';
import { LinearGradient } from 'expo-linear-gradient';
import { getGlobalSettings } from '../../services/globalSettings';
import { Ionicons } from '@expo/vector-icons';

/**
 * SettingsScreen
 *
 * Modern SaaS settings screen (ScrollView)
 * - Profile Card
 * - PRO Banner
 * - Sections (Subscription, Appearance, Account, Automation, Support)
 *
 * NOTE: Backend/data wiring can be added later. For now we use the already-hydrated `currentUser`.
 */
export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { preference } = useTheme();
  const colors = getSettingsColors();
  const styles = React.useMemo(() => makeStyles(colors), [preference]);
  const currentUser = useAppStore((s) => s.currentUser);
  const role = useAppStore((s) => s.role);
  const logout = useAppStore((s) => s.logout);
  const patchCurrentUser = useAppStore((s) => s.patchCurrentUser);
  const fetchMyProfile = useAppStore((s) => s.fetchMyProfile);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const hydrateAttemptedRef = useRef(false);
  const [infoModal, setInfoModal] = useState<{ title: string; description?: string } | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // Use real user values (no example placeholders).
  // - library: show ownerName + email
  // - student: show name + mobile (as "email" line substitute)
  const name =
    currentUser?.role === 'library'
      ? currentUser?.ownerName || currentUser?.name || ''
      : currentUser?.name || '';
  const email =
    currentUser?.role === 'library'
      ? currentUser?.email || ''
      : currentUser?.mobile || '';
  // Profile image source:
  // - library: logoUrl (used as profile image)
  // - student: photoUrl
  const profileImageUrl = avatarPreview || currentUser?.logoUrl || (currentUser as any)?.photoUrl || null;

  const pickAndUploadAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setInfoModal({ title: 'Permission required', description: 'Please allow access to your photo library.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    const uri = result.assets[0].uri;
    // Preview immediately
    setAvatarPreview(uri);

    // Upload (backend: POST /api/user/upload-profile)
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() ?? 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('photo', { uri, name: filename, type } as unknown as Blob);

      const response = await api.post<{ ok: boolean; imageUrl: string }>(`/api/user/upload-profile`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const imageUrl = response.data?.imageUrl;
      if (imageUrl) {
        // Save returned URL to store instantly.
        if (currentUser?.role === 'library') patchCurrentUser({ logoUrl: imageUrl });
        else if (currentUser?.role === 'student') patchCurrentUser({ photoUrl: imageUrl } as any);
        setAvatarPreview(null);
      }
    } catch (e: any) {
      setAvatarPreview(null);
      setInfoModal({ title: 'Upload failed', description: e?.message || 'Could not upload image.' });
    } finally {
      setAvatarUploading(false);
    }
  };
  const plan = (currentUser?.plan || 'free') as 'free' | 'pro';
  const expiry = currentUser?.planExpiryDate || null;

  // If values are missing, fetch from backend once and patch store.
  useEffect(() => {
    const effectiveRole = currentUser?.role || role;
    if (!effectiveRole) return;
    if (hydrating) return;

    const needsLibrary =
      effectiveRole === 'library' && (!currentUser?.ownerName || !currentUser?.email);
    const needsStudent =
      effectiveRole === 'student' && (!currentUser?.name || !currentUser?.mobile);
    const needsFirstHydration = !currentUser; // currentUser isn't persisted → hydrate once
    if (!needsFirstHydration && !needsLibrary && !needsStudent) return;
    if (hydrateAttemptedRef.current) return;
    hydrateAttemptedRef.current = true;

    setHydrating(true);
    (async () => {
      try {
        await fetchMyProfile();
      } catch {
        // Non-fatal: keep current UI values.
      } finally {
        setHydrating(false);
      }
    })();
  }, [currentUser, role, hydrating, fetchMyProfile]);

  const expiryDays = useMemo(() => {
    if (!expiry) return 0;
    const t = new Date(expiry).getTime();
    if (!Number.isFinite(t)) return 0;
    const diff = Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diff);
  }, [expiry]);

  const section = (title: string) => (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{String(title).toUpperCase()}</Text>
    </View>
  );

  const confirmSignOut = () => {
    setShowSignOutModal(true);
  };

  const [support, setSupport] = useState<{ whatsapp: string; channel: string; email: string } | null>(null);
  useEffect(() => {
    getGlobalSettings()
      .then((s) => setSupport(s.communication || null))
      .catch(() => setSupport(null));
  }, []);
  // TODO: Replace with your actual app store links
  const APP_STORE_URL = 'https://apps.apple.com/';
  const PLAY_STORE_URL = 'https://play.google.com/store';

  const openWhatsApp = async (text: string) => {
    const message = encodeURIComponent(text);
    const num = String(support?.whatsapp || '').replace(/\D/g, '');
    if (!num) {
      setInfoModal({ title: 'WhatsApp', description: 'Support WhatsApp number is not set by Super Admin yet.' });
      return;
    }
    const url = `https://wa.me/${num}?text=${message}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        setInfoModal({ title: 'WhatsApp', description: `WhatsApp is not available. Number: ${num}` });
        return;
      }
      await Linking.openURL(url);
    } catch {
      setInfoModal({ title: 'WhatsApp', description: `Could not open WhatsApp. Number: ${num}` });
    }
  };

  const openEmail = async () => {
    const subject = encodeURIComponent('TrackMyLibrary Support');
    const body = encodeURIComponent('Hi Support,\n\nI need help with TrackMyLibrary.\n');
    const mail = String(support?.email || '').trim();
    if (!mail) {
      setInfoModal({ title: 'Email', description: 'Support email is not set by Super Admin yet.' });
      return;
    }
    const url = `mailto:${mail}?subject=${subject}&body=${body}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        setInfoModal({ title: 'Email', description: `Email app not available. Email: ${mail}` });
        return;
      }
      await Linking.openURL(url);
    } catch {
      setInfoModal({ title: 'Email', description: `Could not open mail app. Email: ${mail}` });
    }
  };

  const rateApp = async () => {
    const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        setInfoModal({ title: 'Rate App', description: 'Store is not available on this device.' });
        return;
      }
      await Linking.openURL(url);
    } catch {
      setInfoModal({ title: 'Rate App', description: 'Could not open store link.' });
    }
  };

  const navTo = (name: string) => {
    // SettingsScreen is used inside different navigators (tabs vs stacks).
    // For library tabs, these routes live on the parent stack (LibraryMainStack).
    if (role === 'library') {
      (navigation.getParent() as any)?.navigate(name);
      return;
    }
    // For admin tabs, map to available tab routes.
    if (role === 'admin') {
      if (name === 'Subscription') {
        navigation.navigate('AdminRoot', { screen: 'Subscriptions' });
        return;
      }
      if (name === 'AdminPlans') {
        (navigation.getParent() as any)?.navigate?.('AdminPlans');
        navigation.navigate('AdminPlans');
        return;
      }
      if (name === 'AdminGlobalSettings') {
        (navigation.getParent() as any)?.navigate?.('AdminGlobalSettings');
        navigation.navigate('AdminGlobalSettings');
        return;
      }
      setInfoModal({ title: 'Not available', description: 'This option is not available for admin accounts.' });
      return;
    }
    // For student, profile lives on the parent stack (StudentMainStack).
    if (role === 'student') {
      if (name === 'Profile') {
        (navigation.getParent() as any)?.navigate('StudentProfile');
        return;
      }
      setInfoModal({ title: 'Not available', description: 'This option is not available for student accounts.' });
      return;
    }
    // Fallback: try current navigator.
    navigation.navigate(name);
  };

  const navToAppearance = () => {
    // For nested tabs, prefer parent stack when present.
    const parent = navigation.getParent?.();
    if (parent?.navigate) parent.navigate('Appearance');
    else navigation.navigate('Appearance');
  };

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subTitle}>Manage your account and preferences</Text>
      </View>

      <ProfileCard
        name={hydrating && !name ? 'Loading…' : name || '—'}
        email={hydrating && !email ? ' ' : email || '—'}
        pro={plan === 'pro'}
        onPress={() => navTo('Profile')}
        imageUrl={profileImageUrl}
        uploading={avatarUploading}
        onPressAvatar={pickAndUploadAvatar}
        onPressCamera={pickAndUploadAvatar}
      />

      {plan === 'pro' ? (
        <View style={{ marginTop: settingsSpacing.itemGap }}>
          <ProBanner expiryDays={expiryDays} onPress={() => navTo('Subscription')} />
        </View>
      ) : null}

      <View style={{ marginTop: settingsSpacing.sectionGap }}>
        {role === 'admin' ? (
          <>
            {section('ADMIN')}
            <SettingsSectionCard>
              <SettingsItem
                title="Plan Management"
                subtitle="Create, edit discounts & pricing"
                icon="pricetags-outline"
                iconColor="#7C3AED"
                iconBgColor="rgba(124,58,237,0.12)"
                onPress={() => navTo('AdminPlans')}
              />
              <SettingsItem
                title="Privacy / Terms URLs"
                subtitle="Update app legal links"
                icon="link-outline"
                iconColor="#2563EB"
                iconBgColor="rgba(37,99,235,0.12)"
                onPress={() => navTo('AdminGlobalSettings')}
                hideDivider
              />
            </SettingsSectionCard>
          </>
        ) : null}

        {section('SUBSCRIPTION')}
        <SettingsSectionCard>
          <SettingsItem
            title="Manage Subscription"
            subtitle="Upgrade or change your plan"
            icon="card-outline"
            iconColor="#16A34A"
            iconBgColor="rgba(22,163,74,0.12)"
            onPress={() => navTo('Subscription')}
          />
          <SettingsItem
            title="Billing History"
            subtitle="Invoices and payment records"
            icon="receipt-outline"
            iconColor="#F59E0B"
            iconBgColor="rgba(245,158,11,0.14)"
            onPress={() => navTo('Billing')}
          />
          <SettingsItem
            title="Restore Purchases"
            subtitle="Recover your premium status"
            icon="refresh-outline"
            iconColor="#2563EB"
            iconBgColor="rgba(37,99,235,0.12)"
            onPress={() => setInfoModal({ title: 'Restore', description: 'Coming soon' })}
            hideDivider
          />
        </SettingsSectionCard>

        {section('APPEARANCE')}
        <SettingsSectionCard>
          <SettingsItem
            title="Theme Mode"
            subtitle={`Currently: ${
              preference === 'system' ? 'System' : preference === 'dark' ? 'Dark' : 'Light'
            }`}
            icon="moon-outline"
            iconColor="#2563EB"
            iconBgColor="rgba(37,99,235,0.12)"
            onPress={navToAppearance}
            hideDivider
          />
        </SettingsSectionCard>

        {section('ACCOUNT')}
        <SettingsSectionCard>
          <SettingsItem
            title="Edit Profile"
            subtitle="Name, email, photo"
            icon="person-outline"
            iconColor="#7C3AED"
            iconBgColor="rgba(124,58,237,0.12)"
            onPress={() => navTo('Profile')}
          />
          <SettingsItem
            title="Branch Switcher"
            subtitle="Change your branch"
            icon="git-branch-outline"
            iconColor="#2563EB"
            iconBgColor="rgba(37,99,235,0.12)"
            onPress={() => navTo('Branch')}
          />
          <SettingsItem
            title="Library Branding"
            subtitle="Logo and colors"
            icon="color-palette-outline"
            iconColor="#F97316"
            iconBgColor="rgba(249,115,22,0.14)"
            onPress={() => navTo('LibraryBranding')}
            hideDivider
          />
        </SettingsSectionCard>

        {section('AUTOMATION')}
        <SettingsSectionCard>
          <SettingsItem
            title="WhatsApp Notifications"
            subtitle="Auto reminders & updates"
            icon="chatbubble-ellipses-outline"
            iconColor="#16A34A"
            iconBgColor="rgba(22,163,74,0.12)"
            onPress={() => setInfoModal({ title: 'WhatsApp', description: 'Coming soon' })}
          />
          <SettingsItem
            title="Message Templates"
            subtitle="Reusable messages"
            icon="document-text-outline"
            iconColor="#7C3AED"
            iconBgColor="rgba(124,58,237,0.12)"
            onPress={() => navTo('MessageTemplates')}
          />
          <SettingsItem
            title="Shift Management"
            subtitle="Timing & scheduling"
            icon="time-outline"
            iconColor="#2563EB"
            iconBgColor="rgba(37,99,235,0.12)"
            onPress={() => setInfoModal({ title: 'Shifts', description: 'Coming soon' })}
            hideDivider
          />
        </SettingsSectionCard>

        {section('SUPPORT')}
        <SettingsSectionCard>
          {support?.whatsapp ? (
            <SettingsItem
              title="Contact on WhatsApp"
              subtitle={`Message admin for help • ${support.whatsapp}`}
              icon="logo-whatsapp"
              iconColor="#16A34A"
              iconBgColor="rgba(22,163,74,0.12)"
              onPress={() => openWhatsApp('Hi Admin, I need help with TrackMyLibrary.')}
            />
          ) : null}
          {support?.channel ? (
            <SettingsItem
              title="Join Community Channel"
              subtitle="Connect with admin for updates & help"
              icon="people-outline"
              iconColor="#2563EB"
              iconBgColor="rgba(37,99,235,0.12)"
              onPress={async () => {
                try {
                  const url = String(support?.channel || '').trim();
                  const ok = await Linking.canOpenURL(url);
                  if (!ok) {
                    setInfoModal({ title: 'Channel', description: 'Link is not available on this device.' });
                    return;
                  }
                  await Linking.openURL(url);
                } catch {
                  setInfoModal({ title: 'Channel', description: 'Could not open channel link.' });
                }
              }}
            />
          ) : null}
          {support?.email ? (
            <SettingsItem
              title="Email Support"
              subtitle={support.email}
              icon="mail-outline"
              iconColor="#2563EB"
              iconBgColor="rgba(37,99,235,0.12)"
              onPress={openEmail}
            />
          ) : null}
          <SettingsItem
            title="Rate App"
            subtitle="Show some love on the store"
            icon="star-outline"
            iconColor="#F59E0B"
            iconBgColor="rgba(245,158,11,0.14)"
            onPress={rateApp}
          />
          {/* Removed: list-style Sign Out (replaced by premium centered button below) */}
        </SettingsSectionCard>

        {/* Premium logout CTA (centered) */}
        <View style={styles.logoutWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={confirmSignOut} style={styles.logoutBtn}>
            <LinearGradient
              colors={['#EF4444', '#B91C1C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoutGrad}
            >
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.logoutTxt}>Sign Out</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.logoutHint}>You can sign in again anytime.</Text>
        </View>
      </View>
      </ScrollView>

      <ConfirmModal
        visible={showSignOutModal}
        tone="primary"
        label="CONFIRM"
        title="Sign out?"
        description="Do you want to sign out?"
        cancelText="Cancel"
        confirmText="Sign out"
        confirmIcon="log-out-outline"
        onCancel={() => setShowSignOutModal(false)}
        onConfirm={() => {
          setShowSignOutModal(false);
          logout();
          navigation.navigate('Login');
        }}
      />

      <ConfirmModal
        visible={!!infoModal}
        tone="neutral"
        label="INFO"
        title={infoModal?.title ?? 'Info'}
        description={infoModal?.description}
        showCancel={false}
        confirmText="OK"
        confirmIcon="checkmark-outline"
        onCancel={() => setInfoModal(null)}
        onConfirm={() => setInfoModal(null)}
      />
    </>
  );
}

function makeStyles(colors: ReturnType<typeof getSettingsColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { padding: settingsSpacing.screen, paddingBottom: 140 },

    header: { marginBottom: 14 },
    title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.4 },
    subTitle: { marginTop: 6, fontSize: 13, fontWeight: '700', color: colors.subText, lineHeight: 18 },

    sectionHead: { marginTop: 20, marginBottom: 8 },
    sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.subText, letterSpacing: 1.2 },

    logoutWrap: { marginTop: 18, paddingHorizontal: 6, alignItems: 'center' },
    logoutBtn: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.30)',
    },
    logoutGrad: {
      height: 52,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 18,
    },
    logoutTxt: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
    logoutHint: { marginTop: 10, fontSize: 12, fontWeight: '700', color: colors.subText, textAlign: 'center' },
  });
}

