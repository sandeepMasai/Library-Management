import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeProvider';
import { theme } from '../../theme';
import { useAppStore } from '../../store';
import { ConfirmModal } from '../../components/ConfirmModal';
import { getLibraryContact, toApiErrorMessage as toLibraryErr } from '../../services/libraryContact';
import { getGlobalSettings, isValidHttpUrl, toApiErrorMessage } from '../../services/globalSettings';

export default function StudentSettingsScreen({ navigation }: { navigation: any }) {
  const { mode } = useTheme();
  const styles = useMemo(() => makeStyles(mode), [mode]);

  const currentUser = useAppStore((s) => s.currentUser);
  const logout = useAppStore((s) => s.logout);

  const [infoModal, setInfoModal] = useState<{ title: string; description?: string } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [contact, setContact] = useState<Awaited<ReturnType<typeof getLibraryContact>> | null>(null);

  useEffect(() => {
    getLibraryContact()
      .then(setContact)
      .catch(() => setContact(null));
  }, []);

  const name = (currentUser?.name ?? 'Student').toUpperCase();
  const mobile = (currentUser as any)?.mobile ?? '';
  const username = (currentUser as any)?.username ?? '';
  const photoUrl = String((currentUser as any)?.photoUrl || '').trim();

  const openWhatsApp = async () => {
    try {
      const c = await getLibraryContact();
      if (!c.communication?.whatsapp) {
        setInfoModal({ title: 'WhatsApp', description: 'Library WhatsApp number is not set yet.' });
        return;
      }
      const msg = 'Hello, I need help with my library account';
      const url = `https://wa.me/${c.communication.whatsapp}?text=${encodeURIComponent(msg)}`;
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        setInfoModal({ title: 'WhatsApp', description: 'WhatsApp is not available on this device.' });
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      setInfoModal({ title: 'WhatsApp', description: toLibraryErr(e) });
    }
  };

  const openChannel = async () => {
    try {
      const c = await getLibraryContact();
      const url = String(c.communication?.channel || '').trim();
      if (!url) {
        setInfoModal({ title: 'Channel', description: 'Library channel link is not set yet.' });
        return;
      }
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        setInfoModal({ title: 'Channel', description: 'Link is not available on this device.' });
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      setInfoModal({ title: 'Channel', description: toLibraryErr(e) });
    }
  };

  const openEmail = async () => {
    try {
      const c = await getLibraryContact();
      const email = String(c.communication?.email || '').trim();
      if (!email) {
        setInfoModal({ title: 'Email', description: 'Library email is not set yet.' });
        return;
      }
      const url = `mailto:${email}`;
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        setInfoModal({ title: 'Email', description: 'Email app is not available on this device.' });
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      setInfoModal({ title: 'Email', description: toLibraryErr(e) });
    }
  };

  const onLogout = () => setShowLogoutModal(true);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView style={styles.safe} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarTxt}>{name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.profileSub} numberOfLines={1}>
            {username ? `@${username}` : ''}
            {mobile ? (username ? `  ·  ${mobile}` : mobile) : ''}
          </Text>
        </View>

        <Section title="ACCOUNT">
          <Item icon="person-outline" title="Profile" sub="View your profile" onPress={() => navigation.getParent()?.navigate('StudentProfile')} />
        </Section>

        <Section title="SUBSCRIPTION">
          <Item
            icon="calendar-outline"
            title="Extend Plan"
            sub="Request membership extension"
            onPress={() => setInfoModal({ title: 'Extend Plan', description: 'Please contact admin to extend your plan.' })}
          />
        </Section>

        <Section title="SUPPORT">
          {contact?.communication?.whatsapp ? (
            <Item icon="logo-whatsapp" title="WhatsApp Chat" sub="Contact library on WhatsApp" onPress={openWhatsApp} last={!contact?.communication?.channel && !contact?.communication?.email} />
          ) : null}
          {contact?.communication?.channel ? (
            <Item icon="megaphone-outline" title="Join Channel" sub="Library announcements" onPress={openChannel} last={!contact?.communication?.email} />
          ) : null}
          {contact?.communication?.email ? (
            <Item icon="mail-outline" title="Email Support" sub="Send email to library" onPress={openEmail} last />
          ) : null}
        </Section>

        <Section title="LEGAL">
          <Item
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            sub="View policy"
            onPress={async () => {
              try {
                const s = await getGlobalSettings();
                const url = String(s.privacyPolicyUrl || '').trim();
                if (!isValidHttpUrl(url)) {
                  setInfoModal({ title: 'Not configured', description: 'Privacy Policy link is not set yet.' });
                  return;
                }
                navigation.getParent()?.navigate('StudentLegalWebView', { title: 'Privacy Policy', url });
              } catch (e) {
                setInfoModal({ title: 'Failed', description: toApiErrorMessage(e) });
              }
            }}
          />
          <Item
            icon="document-text-outline"
            title="Terms & Conditions"
            sub="View terms"
            onPress={async () => {
              try {
                const s = await getGlobalSettings();
                const url = String(s.termsUrl || '').trim();
                if (!isValidHttpUrl(url)) {
                  setInfoModal({ title: 'Not configured', description: 'Terms link is not set yet.' });
                  return;
                }
                navigation.getParent()?.navigate('StudentLegalWebView', { title: 'Terms & Conditions', url });
              } catch (e) {
                setInfoModal({ title: 'Failed', description: toApiErrorMessage(e) });
              }
            }}
          />
          <Item
            icon="information-circle-outline"
            title="About App"
            sub="Version & info"
            onPress={() => setInfoModal({ title: 'About', description: 'libDesk (Student) v1.0.0' })}
            last
          />
        </Section>

        {/* Premium logout CTA (centered) */}
        <View style={styles.logoutWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={onLogout} style={styles.logoutBtn}>
            <LinearGradient
              colors={['#EF4444', '#B91C1C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoutGrad}
            >
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.logoutTxt}>Logout</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.logoutHint}>You can sign in again anytime.</Text>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showLogoutModal}
        tone="primary"
        label="CONFIRM"
        title="Logout?"
        description="Are you sure you want to sign out?"
        cancelText="Cancel"
        confirmText="Logout"
        confirmIcon="log-out-outline"
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={() => {
          setShowLogoutModal(false);
          logout();
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
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ marginLeft: 16, marginBottom: 8, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, color: theme.colors.mutedText }}>
        {title}
      </Text>
      <View style={{ marginHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Item(props: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const { danger, last } = props;
  const fg = danger ? theme.colors.danger : theme.colors.text;
  const sub = danger ? theme.colors.danger + 'AA' : theme.colors.mutedText;
  return (
    <TouchableOpacity onPress={props.onPress} activeOpacity={0.86} style={{ paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'transparent' }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: danger ? 'rgba(239,68,68,0.12)' : theme.colors.background,
          borderWidth: 1,
          borderColor: danger ? 'rgba(239,68,68,0.24)' : theme.colors.border,
        }}
      >
        <Ionicons name={props.icon} size={18} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: fg }} numberOfLines={1}>
          {props.title}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: sub }} numberOfLines={1}>
          {props.sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={sub} />
      {!last ? <View style={{ position: 'absolute', left: 64, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} /> : null}
    </TouchableOpacity>
  );
}

function makeStyles(mode: 'light' | 'dark') {
  const isDark = mode === 'dark';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingBottom: 28 },
    profileCard: {
      marginHorizontal: 12,
      marginTop: 14,
      padding: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      gap: 8,
      ...theme.shadow.card,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.28)' : '#C7D2FE',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 64, height: 64, borderRadius: 22 },
    avatarTxt: { fontSize: 26, fontWeight: '900', color: theme.colors.primary },
    profileName: { marginTop: 4, fontSize: 17, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2, textAlign: 'center' },
    profileSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText, textAlign: 'center' },

    logoutWrap: { marginTop: 18, paddingHorizontal: 12, alignItems: 'center' },
    logoutBtn: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.35)',
      ...theme.shadow.card,
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
    logoutHint: { marginTop: 10, fontSize: 12, fontWeight: '700', color: theme.colors.mutedText, textAlign: 'center' },
  });
}

