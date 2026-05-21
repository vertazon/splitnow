import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { initialsFromName } from '@/constants/dateFormat';
import { signOut } from '@/hooks/useAuth';
import { useUserStore } from '@/store/useUserStore';
import { supabase } from '@/lib/supabase';
import type { AvatarColor } from '@/types/database';
import { CONTACT_EMAIL, PRIVACY_URL, TERMS_URL } from '@/constants/app';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    const n = digits.slice(2);
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function MenuItem({
  icon,
  label,
  sub,
  onPress,
  danger,
  hideCaret,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  hideCaret?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.65}>
      <View style={[
        styles.menuIconWrap,
        danger && styles.menuIconWrapDanger,
      ]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? colors.danger : colors.text2}
        />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {!hideCaret && (
        <Ionicons
          name="chevron-forward"
          size={15}
          color={danger ? colors.danger : colors.text3}
        />
      )}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const router      = useRouter();
  const currentUser = useUserStore(s => s.currentUser);

  const avatarColor = (currentUser?.avatar_color ?? 'green') as AvatarColor;
  const av          = avatarColors[avatarColor] ?? avatarColors.green;
  const initials    = initialsFromName(currentUser?.name);
  const hasUpi      = !!currentUser?.upi_id;

  // Email comes from Supabase auth session (not stored in public.users)
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthEmail(data.user?.email ?? null));
  }, []);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out',
      "You'll need to verify your email to sign back in.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => { await signOut(); },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ── */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: av.bg }]}>
            <Text style={[styles.avatarText, { color: av.text }]}>{initials}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{currentUser?.name ?? '—'}</Text>
            {currentUser?.phone
              ? <Text style={styles.userPhone}>{formatPhone(currentUser.phone)}</Text>
              : authEmail
                ? <Text style={styles.userPhone}>{authEmail}</Text>
                : null
            }
            <View style={styles.upiRow}>
              <View style={[styles.upiDot, hasUpi && styles.upiDotActive]} />
              <Text style={[styles.upiText, hasUpi && styles.upiTextActive]}>
                {hasUpi ? currentUser!.upi_id! : 'No UPI ID · tap Edit to add'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="pencil-outline" size={15} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* ── Account section ── */}
        <SectionLabel label="ACCOUNT" />
        <View style={styles.menuCard}>
          <MenuItem
            icon="person-outline"
            label="Edit Profile"
            sub="Name, avatar colour & UPI ID"
            onPress={() => router.push('/profile')}
          />
          <Divider />
          <MenuItem
            icon="people-outline"
            label="Manage Groups"
            sub="Members & balances"
            onPress={() => router.push('/groups' as never)}
          />
          <Divider />
          <MenuItem
            icon="person-add-outline"
            label="Friends"
            sub="Add & manage friends"
            onPress={() => router.push('/(tabs)/friends' as never)}
          />
        </View>

        {/* ── Preferences section ── */}
        <SectionLabel label="PREFERENCES" />
        <View style={styles.menuCard}>
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            sub="Push alerts & activity preferences"
            onPress={() => router.push('/notification-settings' as never)}
          />
        </View>

        {/* ── Support section ── */}
        <SectionLabel label="SUPPORT" />
        <View style={styles.menuCard}>
          <MenuItem
            icon="mail-outline"
            label="Contact us"
            sub={CONTACT_EMAIL}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
          />
          <Divider />
          <MenuItem
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
          <Divider />
          <MenuItem
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL(TERMS_URL)}
          />
        </View>

        {/* ── Sign out ── */}
        <View style={[styles.menuCard, styles.menuCardLast]}>
          <MenuItem
            icon="log-out-outline"
            label="Sign out"
            onPress={handleSignOut}
            danger
            hideCaret
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.syne,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  headerSpacer: { width: 36 },

  // Scroll
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 14,
    marginBottom: 28,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentMid,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: fonts.syne,
    fontSize: 20,
    fontWeight: '800',
  },
  userMeta: {
    flex: 1,
    gap: 3,
  },
  userName: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  userPhone: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  upiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text3,
  },
  upiDotActive: {
    backgroundColor: colors.accent,
  },
  upiText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text3,
  },
  upiTextActive: {
    color: colors.text2,
  },

  // Section label
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 10,
    marginTop: 4,
  },

  // Menu card
  menuCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuCardLast: {
    marginBottom: 0,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },

  // Menu item
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 13,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuIconWrapDanger: {
    backgroundColor: colors.dangerDim,
    borderColor: 'rgba(255,89,89,0.2)',
  },

  menuText: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  menuLabelDanger: {
    color: colors.danger,
  },
  menuSub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text3,
  },
});
