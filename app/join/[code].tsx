import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { initialsFromName } from '@/constants/dateFormat';
import { useUserStore } from '@/store/useUserStore';
import { usePendingInvite } from '@/store/usePendingInvite';
import { useAddFriend, FriendError } from '@/hooks/useFriends';
import type { AvatarColor } from '@/types/database';
import type { User } from '@/types/database';

// ─── States ───────────────────────────────────────────────────────────────────

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'success'; friend: User; alreadyFriends: boolean }
  | { kind: 'error'; code: 'INVALID_CODE' | 'SELF_ADD' | 'NETWORK' | 'UNKNOWN' };

// ─── Animated avatar ─────────────────────────────────────────────────────────

function FriendAvatar({ user }: { user: User }) {
  const scale = useSharedValue(0);
  const av = avatarColors[(user.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;

  useEffect(() => {
    scale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 180 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.avatar, { backgroundColor: av.bg }, animStyle]}>
      <Text style={[styles.avatarText, { color: av.text }]}>
        {initialsFromName(user.name ?? '?')}
      </Text>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const currentUserId = useUserStore(s => s.currentUserId);
  const currentUser   = useUserStore(s => s.currentUser);
  const clearPending  = usePendingInvite(s => s.clearCode);

  const addFriend = useAddFriend();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const processed = useRef(false);

  // ── Not authenticated — save code and let AuthGuard redirect ──────────────
  useEffect(() => {
    if (!currentUserId || !currentUser?.name) {
      // Save so PendingInviteProcessor can retry after auth
      usePendingInvite.getState().setCode(code);
      // AuthGuard in _layout.tsx will redirect to /(auth)/phone automatically
    }
  }, []);

  // ── Process the invite ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId || !currentUser?.name) return; // wait for auth
    if (processed.current) return;
    processed.current = true;

    // Clear any pending store entry — we're processing it now
    clearPending();

    addFriend.mutate(
      { currentUserId, inviteCode: code },
      {
        onSuccess: (result) => {
          setState({ kind: 'success', friend: result.friend, alreadyFriends: result.alreadyFriends });
        },
        onError: (err: any) => {
          const msg: string = err?.message ?? '';
          if (msg === FriendError.INVALID_CODE) setState({ kind: 'error', code: 'INVALID_CODE' });
          else if (msg === FriendError.SELF_ADD) setState({ kind: 'error', code: 'SELF_ADD' });
          else setState({ kind: 'error', code: 'UNKNOWN' });
        },
      }
    );
  }, [currentUserId, currentUser?.name]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (state.kind === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Connecting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'success') {
    const { friend, alreadyFriends } = state;
    const av = avatarColors[(friend.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;

    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <FriendAvatar user={friend} />

          <Text style={styles.successTitle}>
            {alreadyFriends ? 'Already friends!' : 'You\'re now friends!'}
          </Text>
          <Text style={[styles.successName, { color: av.text }]}>
            {friend.name}
          </Text>
          {!alreadyFriends && (
            <Text style={styles.successSub}>
              You can now split expenses with each other.
            </Text>
          )}

          <TouchableOpacity
            style={styles.cta}
            onPress={() => router.replace('/(tabs)' as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Go to Home →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.replace('/(tabs)/friends' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryText}>View Friends</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Error states
  const errorMap: Record<string, { emoji: string; title: string; sub: string }> = {
    INVALID_CODE: {
      emoji: '🔍',
      title: 'Code not found',
      sub: 'This invite link is invalid or has expired. Ask your friend to share it again.',
    },
    SELF_ADD: {
      emoji: '😅',
      title: 'That\'s your own code',
      sub: 'You can\'t add yourself as a friend. Share this code with someone else.',
    },
    NETWORK: {
      emoji: '📡',
      title: 'Connection error',
      sub: 'Check your internet connection and try again.',
    },
    UNKNOWN: {
      emoji: '⚠️',
      title: 'Something went wrong',
      sub: 'We couldn\'t process this invite. Please try again.',
    },
  };

  const err = errorMap[state.code] ?? errorMap.UNKNOWN;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.centered}>
        <Text style={styles.errorEmoji}>{err.emoji}</Text>
        <Text style={styles.errorTitle}>{err.title}</Text>
        <Text style={styles.errorSub}>{err.sub}</Text>

        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.replace('/(tabs)' as never)}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },

  loadingText: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: colors.text2,
    marginTop: 12,
  },

  // Success
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontFamily: fonts.syne,
    fontSize: 32,
    fontWeight: '800',
  },
  successTitle: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  successName: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  successSub: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },

  // Error
  errorEmoji: { fontSize: 52, marginBottom: 4 },
  errorTitle: {
    fontFamily: fonts.syne,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  errorSub: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },

  // Buttons
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text2,
  },
});
