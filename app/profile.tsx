import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { saveProfile, signOut } from '@/hooks/useAuth';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useMembers } from '@/hooks/useMembers';
import { useBalances } from '@/hooks/useBalances';
import { initialsFromName } from '@/constants/dateFormat';
import { formatAmount } from '@/constants/amountUtils';
import type { AvatarColor } from '@/types/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

function memberSince(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    const n = digits.slice(2);
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

const COLOR_OPTIONS: { id: AvatarColor; label: string }[] = [
  { id: 'green',  label: 'Green'  },
  { id: 'blue',   label: 'Blue'   },
  { id: 'purple', label: 'Purple' },
  { id: 'orange', label: 'Orange' },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const currentUser = useUserStore(s => s.currentUser);
  const groupId = useGroupStore(s => s.currentGroupId);

  const { data: members = [] } = useMembers(groupId);
  const { data: balances = [] } = useBalances(groupId);

  const [name, setName]               = useState(currentUser?.name ?? '');
  const [upiId, setUpiId]             = useState(currentUser?.upi_id ?? '');
  const [avatarColor, setAvatarColor] = useState<AvatarColor>(
    (currentUser?.avatar_color as AvatarColor) ?? 'green'
  );
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isValid    = name.trim().length >= 2;
  const hasChanges =
    name.trim()  !== (currentUser?.name ?? '')         ||
    upiId.trim() !== (currentUser?.upi_id ?? '')       ||
    avatarColor  !== ((currentUser?.avatar_color as AvatarColor) ?? 'green');

  const av      = avatarColors[avatarColor] ?? avatarColors.green;
  const preview = name.trim() ? initialsFromName(name) : '?';

  // Net position for the quick stat
  const netAmt = useMemo(() => balances.reduce((s, b) => s + b.amount, 0), [balances]);

  // Other group members (excluding current user)
  const otherMembers = useMemo(
    () => members.filter(m => m.id !== currentUser?.id),
    [members, currentUser]
  );

  const handleSave = useCallback(async () => {
    if (!isValid || loading) return;
    const userId = useUserStore.getState().currentUserId;
    if (!userId) { setError('Session expired — please sign in again.'); return; }

    setError(null);
    setLoading(true);
    const { error: saveError } = await saveProfile(userId, {
      name: name.trim(),
      avatarColor,
      upiId: upiId.trim() || undefined,
    });
    setLoading(false);
    if (saveError) setError(saveError);
    else router.back();
  }, [isValid, loading, name, avatarColor, upiId, router]);

  const handleShareInvite = useCallback(async () => {
    const code = currentUser?.invite_code;
    if (!code) return;
    await Share.share({
      title: 'Add me on SplitNow',
      message:
        `Hey! I use SplitNow to split expenses.\n\n` +
        `Add me as a friend:\n\n` +
        `1. Open SplitNow\n` +
        `2. Go to Friends tab\n` +
        `3. Tap "Add a friend" and enter my code:\n\n` +
        `  ${formatInviteCode(code)}\n`,
    });
  }, [currentUser?.invite_code]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out',
      "You'll need to verify your phone number to sign back in.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); } },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Header ── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.75}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* ── Identity card ── */}
          <View style={styles.identityCard}>
            <View style={[styles.avatarLarge, { backgroundColor: av.bg }]}>
              <Text style={[styles.avatarLargeText, { color: av.text }]}>{preview}</Text>
            </View>
            <View style={styles.identityInfo}>
              <Text style={styles.identityName}>{name.trim() || '—'}</Text>
              <Text style={styles.identityPhone}>{formatPhone(currentUser?.phone)}</Text>
              {currentUser?.created_at && (
                <Text style={styles.identityMeta}>Member since {memberSince(currentUser.created_at)}</Text>
              )}
            </View>
          </View>

          {/* ── Quick stats ── */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, netAmt >= 0 ? styles.accent : styles.danger]}>
                {netAmt >= 0 ? '+' : '−'}{formatAmount(Math.abs(netAmt))}
              </Text>
              <Text style={styles.statLabel}>NET BALANCE</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{otherMembers.length + 1}</Text>
              <Text style={styles.statLabel}>GROUP SIZE</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{currentUser?.upi_id ? '✓' : '—'}</Text>
              <Text style={styles.statLabel}>UPI SET</Text>
            </View>
          </View>

          {/* ── Invite ── */}
          {currentUser?.invite_code && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>INVITE A FRIEND</Text>
              <View style={styles.inviteCard}>
                <View style={styles.inviteTop}>
                  <View>
                    <Text style={styles.inviteCodeLabel}>YOUR CODE</Text>
                    <Text style={styles.inviteCode}>
                      {formatInviteCode(currentUser.invite_code)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.inviteShareBtn}
                    onPress={handleShareInvite}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.inviteShareBtnText}>Share →</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.inviteHint}>
                  Friends who tap your link are added instantly.
                </Text>
              </View>
            </View>
          )}

          {/* ── Group members ── */}
          {otherMembers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>YOUR GROUP</Text>
              <View style={styles.card}>
                {otherMembers.map((m, i) => {
                  const mac = avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
                  return (
                    <View key={m.id}>
                      <View style={styles.memberRow}>
                        <View style={[styles.memberAvatar, { backgroundColor: mac.bg }]}>
                          <Text style={[styles.memberAvatarText, { color: mac.text }]}>
                            {initialsFromName(m.name ?? '?')}
                          </Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>{m.name ?? '—'}</Text>
                          {m.upi_id ? (
                            <Text style={styles.memberUpi}>{m.upi_id}</Text>
                          ) : (
                            <Text style={styles.memberUpiMissing}>No UPI set</Text>
                          )}
                        </View>
                        {(() => {
                          const bal = balances.find(b => b.userId === m.id);
                          if (!bal || bal.amount === 0) return null;
                          const isOwed = bal.amount < 0;
                          return (
                            <Text style={[styles.memberBal, isOwed ? styles.danger : styles.accent]}>
                              {isOwed ? '−' : '+'}{formatAmount(Math.abs(bal.amount))}
                            </Text>
                          );
                        })()}
                      </View>
                      {i < otherMembers.length - 1 && <View style={styles.divider} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Edit section ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>EDIT PROFILE</Text>

            {/* Name */}
            <Text style={styles.fieldLabel}>YOUR NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={t => { setName(t); setError(null); }}
              placeholder="e.g. Aryan Sharma"
              placeholderTextColor={colors.text3}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={40}
              selectionColor={colors.accent}
            />

            {/* Colour */}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>AVATAR COLOUR</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map(opt => {
                const ov = avatarColors[opt.id];
                const selected = avatarColor === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => setAvatarColor(opt.id)}
                    style={[
                      styles.colorChip,
                      { backgroundColor: ov.bg, borderColor: selected ? ov.text : colors.border },
                      selected && styles.colorChipSelected,
                    ]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.colorDot, { backgroundColor: ov.text }]} />
                    <Text style={[styles.colorLabel, { color: selected ? ov.text : colors.text2 }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* UPI ID */}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>UPI ID (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              value={upiId}
              onChangeText={setUpiId}
              placeholder="yourname@okaxis"
              placeholderTextColor={colors.text3}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="done"
              selectionColor={colors.accent}
            />
            <Text style={styles.hint}>Used for the "Pay UPI" button in Settle Up.</Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {/* ── Save CTA ── */}
          <TouchableOpacity
            style={[styles.cta, (!isValid || !hasChanges || loading) && styles.ctaDim]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={!isValid || !hasChanges || loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.ctaText}>Save Changes →</Text>
            }
          </TouchableOpacity>

          {/* ── Sign out ── */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.75}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 48 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingTop: 8,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontFamily: fonts.dmSans, fontSize: 14, color: colors.text2 },
  headerTitle: { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text },

  // Identity card
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 16,
    marginBottom: 12,
  },
  avatarLarge: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLargeText: { fontFamily: fonts.syne, fontSize: 24, fontWeight: '800' },
  identityInfo: { flex: 1, gap: 3 },
  identityName: { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text },
  identityPhone: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2 },
  identityMeta: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3, marginTop: 2 },

  // Quick stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingVertical: 16,
    marginBottom: 20,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  statValue: { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 9, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
    color: colors.text3,
  },
  accent: { color: colors.accent },
  danger: { color: colors.danger },

  // Section
  section: { marginBottom: 20 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 22,
    paddingVertical: 4,
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },

  // Group members
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  memberAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  memberAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text },
  memberUpi: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginTop: 1 },
  memberUpiMissing: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3, marginTop: 1 },
  memberBal: { fontFamily: fonts.syne, fontSize: 13, fontWeight: '800', flexShrink: 0 },

  // Invite card
  inviteCard: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentMid,
    borderRadius: 22,
    padding: 16,
  },
  inviteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inviteCodeLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
    opacity: 0.8,
    marginBottom: 3,
  },
  inviteCode: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 2,
  },
  inviteShareBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  inviteShareBtnText: {
    fontFamily: fonts.syne,
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  inviteHint: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
  },

  // Edit fields
  fieldLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    color: colors.text2, marginBottom: 8,
  },
  input: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5, borderColor: colors.borderEmphasis,
    borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 16, color: colors.text,
  },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorChip: {
    flex: 1, borderRadius: 14, borderWidth: 2,
    paddingVertical: 12, alignItems: 'center', gap: 6,
  },
  colorChipSelected: { borderWidth: 2.5 },
  colorDot: { width: 18, height: 18, borderRadius: 9 },
  colorLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600' },
  hint: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3, marginTop: 6 },
  error: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.danger, marginTop: 8 },

  // CTA
  cta: {
    backgroundColor: colors.accent, borderRadius: 16, height: 54,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 16, elevation: 10,
  },
  ctaDim: { opacity: 0.4 },
  ctaText: { fontFamily: fonts.syne, fontSize: 16, fontWeight: '800', color: '#000' },

  // Sign out
  signOutBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 14 },
  signOutText: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, fontWeight: '600', color: colors.danger },
});
