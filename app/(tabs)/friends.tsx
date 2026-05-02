import { useCallback, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Platform, TouchableOpacity,
  Share, ActivityIndicator, ScrollView, RefreshControl, Alert,
  TextInput, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { initialsFromName } from '@/constants/dateFormat';
import { useUserStore } from '@/store/useUserStore';
import { useFriends, useRemoveFriend } from '@/hooks/useFriends';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryKeys';
import type { AvatarColor, User } from '@/types/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`.toUpperCase();
}

// ─── Your invite card ─────────────────────────────────────────────────────────

function MyInviteCard({ inviteCode, onShare }: { inviteCode: string; onShare: () => void }) {
  return (
    <View style={inviteStyles.card}>
      <Text style={inviteStyles.label}>YOUR INVITE CODE</Text>
      <View style={inviteStyles.codeRow}>
        <Text style={inviteStyles.code}>{formatInviteCode(inviteCode)}</Text>
        <TouchableOpacity style={inviteStyles.shareBtn} onPress={onShare} activeOpacity={0.8}>
          <Text style={inviteStyles.shareBtnText}>Share →</Text>
        </TouchableOpacity>
      </View>
      <Text style={inviteStyles.hint}>
        Ask your friend to open SplitNow → Friends → "Add a friend" and type this code.
      </Text>
    </View>
  );
}

const inviteStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentMid,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
  },
  label: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
    opacity: 0.8,
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  code: {
    fontFamily: fonts.syne,
    fontSize: 28,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 4,
  },
  shareBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  shareBtnText: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  hint: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text2,
    lineHeight: 17,
  },
});

// ─── Add a friend card ────────────────────────────────────────────────────────

function AddFriendCard({ onConnect }: { onConnect: (code: string) => void; loading: boolean }) {
  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);

  const normalized = code.replace(/\s/g, '');
  const isReady = normalized.length === 8;

  const handleConnect = () => {
    if (!isReady) return;
    Keyboard.dismiss();
    onConnect(normalized);
    setCode('');
  };

  return (
    <View style={addStyles.card}>
      <Text style={addStyles.label}>ADD A FRIEND</Text>
      <Text style={addStyles.sub}>Enter the 8-character code your friend shared with you.</Text>
      <View style={addStyles.row}>
        <TextInput
          ref={inputRef}
          style={addStyles.input}
          value={code}
          onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8))}
          placeholder="ABCD EFGH"
          placeholderTextColor={colors.text3}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleConnect}
          selectionColor={colors.accent}
          maxLength={8}
        />
        <TouchableOpacity
          style={[addStyles.connectBtn, !isReady && addStyles.connectBtnDim]}
          onPress={handleConnect}
          activeOpacity={0.8}
          disabled={!isReady}
        >
          <Text style={addStyles.connectBtnText}>Connect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const addStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
  },
  label: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 4,
  },
  sub: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text3,
    marginBottom: 14,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.borderEmphasis,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 3,
  },
  connectBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  connectBtnDim: { opacity: 0.4 },
  connectBtnText: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
});

// ─── Friend row ───────────────────────────────────────────────────────────────

function FriendRow({ friend, onRemove }: { friend: User; onRemove: () => void }) {
  const av = avatarColors[(friend.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;

  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.avatar, { backgroundColor: av.bg }]}>
        <Text style={[rowStyles.avatarText, { color: av.text }]}>
          {initialsFromName(friend.name ?? '?')}
        </Text>
      </View>
      <View style={rowStyles.info}>
        <Text style={rowStyles.name}>{friend.name ?? '—'}</Text>
        {friend.upi_id
          ? <Text style={rowStyles.upi}>{friend.upi_id}</Text>
          : <Text style={rowStyles.upiMissing}>No UPI ID set</Text>
        }
      </View>
      <TouchableOpacity
        style={rowStyles.removeBtn}
        onPress={onRemove}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={rowStyles.removeBtnText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, fontWeight: '600', color: colors.text },
  upi: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginTop: 2 },
  upiMissing: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3, marginTop: 2 },
  removeBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: colors.dangerDim,
    borderWidth: 1, borderColor: 'rgba(255,89,89,0.2)',
  },
  removeBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.danger },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const router        = useRouter();
  const currentUser   = useUserStore(s => s.currentUser);
  const currentUserId = useUserStore(s => s.currentUserId);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: friends = [], isLoading } = useFriends(currentUserId);
  const removeFriend = useRemoveFriend();
  const [connecting, setConnecting] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    qc.refetchQueries({ queryKey: qk.friends.all })
      .finally(() => setRefreshing(false));
  }, [qc]);

  const inviteCode = currentUser?.invite_code ?? null;

  const handleShare = useCallback(async () => {
    if (!inviteCode) return;
    await Share.share({
      title: 'Add me on SplitNow',
      // No custom URL scheme — WhatsApp/iMessage don't make them tappable.
      // Make the code the hero so the recipient can enter it manually.
      message:
        `Hey! I use SplitNow to split expenses.\n\n` +
        `Add me as a friend:\n\n` +
        `1. Open SplitNow\n` +
        `2. Go to Friends tab\n` +
        `3. Tap "Add a friend" and enter my code:\n\n` +
        `  ${formatInviteCode(inviteCode)}\n`,
    });
  }, [inviteCode]);

  const handleConnect = useCallback((code: string) => {
    router.push(`/join/${code.toLowerCase()}` as never);
  }, [router]);

  const handleRemove = useCallback((friend: User) => {
    Alert.alert(
      `Remove ${friend.name}?`,
      "You won't be able to split expenses with them until you reconnect.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (!currentUserId) return;
            removeFriend.mutate({ currentUserId, friendId: friend.id });
          },
        },
      ]
    );
  }, [currentUserId, removeFriend]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Friends</Text>
          {friends.length > 0 && (
            <Text style={styles.badge}>{friends.length}</Text>
          )}
        </View>

        {/* Your invite code */}
        {inviteCode && <MyInviteCard inviteCode={inviteCode} onShare={handleShare} />}

        {/* Add a friend */}
        <AddFriendCard onConnect={handleConnect} loading={connecting} />

        {/* Loading */}
        {isLoading && friends.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {/* Friends list */}
        {friends.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>YOUR FRIENDS</Text>
            <View style={styles.card}>
              {friends.map((friend, i) => (
                <View key={friend.id}>
                  <FriendRow friend={friend} onRemove={() => handleRemove(friend)} />
                  {i < friends.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && friends.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySub}>
              Share your code above, or ask a friend for theirs and enter it in "Add a friend".
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20,
  },
  title: { fontFamily: fonts.syne, fontSize: 22, fontWeight: '800', color: colors.text },
  badge: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '600',
    color: colors.text2, backgroundColor: colors.cardElevated,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text2, marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 22, paddingVertical: 4, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  centered: { paddingTop: 48, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 16, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: {
    fontFamily: fonts.syne, fontSize: 18, fontWeight: '800',
    color: colors.text, textAlign: 'center',
  },
  emptySub: {
    fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2,
    textAlign: 'center', lineHeight: 19, paddingHorizontal: 16,
  },
});
