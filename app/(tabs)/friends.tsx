import { useCallback, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Platform, TouchableOpacity,
  Share, ActivityIndicator, ScrollView, RefreshControl, Alert,
  TextInput, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

// ─── Invite card ─────────────────────────────────────────────────────────────

function MyInviteCard({ inviteCode, onShare }: { inviteCode: string; onShare: () => void }) {
  return (
    <View style={inviteStyles.card}>
      <View style={inviteStyles.topRow}>
        <Text style={inviteStyles.label}>YOUR INVITE CODE</Text>
        <TouchableOpacity style={inviteStyles.shareBtn} onPress={onShare} activeOpacity={0.8}>
          <Ionicons name="share-outline" size={14} color="#000" />
          <Text style={inviteStyles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={inviteStyles.codeBlock}>
        <Text style={inviteStyles.codeText}>{inviteCode.toUpperCase()}</Text>
      </View>

      <Text style={inviteStyles.hint}>
        Share this code with a friend — they enter it in "Add a friend" below.
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  label: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
    opacity: 0.9,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  shareBtnText: {
    fontFamily: fonts.syne,
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  codeBlock: {
    backgroundColor: 'rgba(0,212,154,0.12)',
    borderWidth: 1,
    borderColor: colors.accentMid,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  codeText: {
    fontFamily: fonts.syne,
    fontSize: 26,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 6,
  },
  hint: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
    lineHeight: 16,
  },
});

// ─── Add a friend card ────────────────────────────────────────────────────────

function AddFriendCard({ onConnect }: { onConnect: (code: string) => void }) {
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
      <Text style={addStyles.sub}>Enter your friend's 8-character invite code.</Text>
      <View style={addStyles.row}>
        <TextInput
          ref={inputRef}
          style={[addStyles.input, isReady && addStyles.inputReady]}
          value={code}
          onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8))}
          placeholder="XXXX XXXX"
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
    marginBottom: 24,
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
    letterSpacing: 4,
  },
  inputReady: {
    borderColor: colors.accent,
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
  connectBtnDim: { opacity: 0.35 },
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
        <Text style={rowStyles.name} numberOfLines={1}>{friend.name ?? '—'}</Text>
        {friend.upi_id ? (
          <View style={rowStyles.upiRow}>
            <View style={[rowStyles.upiDot, { backgroundColor: colors.accent }]} />
            <Text style={rowStyles.upi} numberOfLines={1}>{friend.upi_id}</Text>
          </View>
        ) : (
          <View style={rowStyles.upiRow}>
            <View style={[rowStyles.upiDot, { backgroundColor: colors.text3 }]} />
            <Text style={rowStyles.upiMissing}>No UPI ID</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={rowStyles.removeBtn}
        onPress={onRemove}
        activeOpacity={0.6}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="person-remove-outline" size={16} color={colors.text3} />
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 15,
    fontWeight: '700',
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  upiDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  upi: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
    flexShrink: 1,
  },
  upiMissing: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text3,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
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
    // Catch self-add client-side before even navigating
    if (inviteCode && code.toLowerCase() === inviteCode.toLowerCase()) {
      Alert.alert("That's your own code", "Share this code with someone else to connect.");
      return;
    }
    router.push(`/join/${code.toLowerCase()}` as never);
  }, [router, inviteCode]);

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
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Friends</Text>
            <Text style={styles.subtitle}>
              {friends.length > 0
                ? `${friends.length} ${friends.length === 1 ? 'person' : 'people'} connected`
                : 'Connect with people you split with'}
            </Text>
          </View>
        </View>

        {/* Your invite code */}
        {inviteCode && <MyInviteCard inviteCode={inviteCode} onShare={handleShare} />}

        {/* Add a friend */}
        <AddFriendCard onConnect={handleConnect} />

        {/* Loading */}
        {isLoading && friends.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {/* Friends list */}
        {friends.length > 0 && (
          <View>
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
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>👥</Text>
            </View>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySub}>
              Share your code or enter a friend's code above to connect.
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
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 3,
  },
  subtitle: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text2,
  },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  centered: { paddingTop: 48, alignItems: 'center' },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 10,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 24,
  },
});
