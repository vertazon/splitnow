import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { initialsFromName } from '@/constants/dateFormat';
import { signOut } from '@/hooks/useAuth';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor } from '@/types/database';

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
      <View style={[styles.menuIconWrap, danger && styles.menuIconWrapDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.text2} />
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

  const handleInvite = useCallback(async () => {
    const code = currentUser?.invite_code;
    if (!code) return;
    const formatted = `${code.slice(0, 4).toUpperCase()} ${code.slice(4).toUpperCase()}`;
    await Share.share({
      title: 'Add me on SplitNow',
      message:
        `Hey! I use SplitNow to split expenses.\n\n` +
        `Add me as a friend:\n\n` +
        `1. Open SplitNow\n` +
        `2. Go to the Friends tab\n` +
        `3. Tap "Add a friend" and enter my code:\n\n` +
        `   ${formatted}\n`,
    });
  }, [currentUser?.invite_code]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out',
      "You'll need to verify your phone number to sign back in.",
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
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── User card ── */}
        <View style={styles.userCard}>
          <View style={[styles.avatar, { backgroundColor: av.bg }]}>
            <Text style={[styles.avatarText, { color: av.text }]}>{initials}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{currentUser?.name ?? '—'}</Text>
            {currentUser?.phone ? (
              <Text style={styles.userPhone}>{formatPhone(currentUser.phone)}</Text>
            ) : null}
            {currentUser?.upi_id ? (
              <Text style={styles.userUpi}>{currentUser.upi_id}</Text>
            ) : null}
          </View>
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
            icon="settings-outline"
            label="Settings"
            sub="Coming soon"
            onPress={() => {}}
            hideCaret
          />
        </View>

        {/* ── General section ── */}
        <SectionLabel label="GENERAL" />
        <View style={styles.menuCard}>
          <MenuItem
            icon="person-add-outline"
            label="Invite a Friend"
            sub="Share your invite code"
            onPress={handleInvite}
          />
        </View>

        {/* ── Sign out ── */}
        <View style={styles.menuCard}>
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
  headerSpacer: {
    width: 36,
  },

  // Scroll
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    gap: 0,
  },

  // User card
  userCard: {
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
  userUpi: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text3,
    marginTop: 1,
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
    fontSize: 11,
    color: colors.text3,
  },
});
