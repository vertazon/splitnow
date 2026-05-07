import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroups } from '@/hooks/useGroups';
import { qk } from '@/lib/queryKeys';
import type { AvatarColor, GroupWithStats } from '@/types/database';
import { ToastNotification } from '@/components/ToastNotification';

// ─── Avatar stack ──────────────────────────────────────────────────────────────

function AvatarStack({ members }: { members: { name: string | null; avatar_color: AvatarColor | null }[] }) {
  const visible = members.slice(0, 4);
  return (
    <View style={styles.avStack}>
      {visible.map((m, i) => {
        const av = avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
        const nameSafe = m.name ?? '';
        const parts = nameSafe.split(' ');
        const initials = parts.length >= 2
          ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
          : nameSafe.slice(0, 2).toUpperCase() || '??';
        return (
          <View key={i} style={[styles.avStackItem, { backgroundColor: av.bg, marginLeft: i === 0 ? 0 : -6 }]}>
            <Text style={[styles.avStackText, { color: av.text }]}>{initials}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({ group, onPress }: { group: GroupWithStats; onPress: () => void }) {
  const isOwed = group.net_balance >= 0;
  const hasBalance = Math.abs(group.net_balance) >= 0.01;
  return (
    <TouchableOpacity style={styles.groupCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.groupCardInner}>
        <View style={styles.groupEmoji}>
          <Text style={styles.groupEmojiText}>{group.cover_emoji}</Text>
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{group.name}</Text>
          <View style={styles.groupMeta}>
            <AvatarStack members={group.members} />
            <Text style={styles.groupMemberCount}>{group.member_count} {Number(group.member_count) === 1 ? 'member' : 'members'}</Text>
          </View>
        </View>
        <View style={styles.groupBalance}>
          {hasBalance ? (
            <>
              <Text style={[styles.groupBalanceAmt, isOwed ? styles.accent : styles.danger]}>
                {isOwed ? '+' : '−'}{formatAmount(Math.abs(group.net_balance))}
              </Text>
              <Text style={styles.groupBalanceLabel}>{isOwed ? 'owed to you' : 'you owe'}</Text>
            </>
          ) : (
            <Text style={styles.groupBalanceSettled}>All settled ✓</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GroupsTabScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: groups = [], isLoading } = useGroups(currentUserId);
  const activeGroups = groups.filter(g => !g.archived_at);
  const archivedGroups = groups.filter(g => !!g.archived_at);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    qc.refetchQueries({ queryKey: qk.groups.list(currentUserId) }).finally(() => setRefreshing(false));
  }, [qc, currentUserId]);

  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Groups</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/groups/create' as never)}
          activeOpacity={0.7}
        >
          <Text style={styles.createBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {isLoading && groups.length === 0 ? (
          <ActivityIndicator color={colors.text2} style={{ marginTop: 40 }} />
        ) : activeGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySubtitle}>Create one to split expenses together.</Text>
            <TouchableOpacity
              style={styles.emptyCtaBtn}
              onPress={() => router.push('/groups/create' as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyCtaText}>+ Create New Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>YOUR GROUPS</Text>
            <View style={styles.groupsList}>
              {activeGroups.map(g => (
                <GroupCard
                  key={g.id}
                  group={g}
                  onPress={() => router.push(`/groups/${g.id}` as never)}
                />
              ))}
            </View>

            {archivedGroups.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>PAST GROUPS</Text>
                <View style={[styles.groupsList, { opacity: 0.55 }]}>
                  {archivedGroups.map(g => (
                    <View key={g.id} style={[styles.groupCard, { borderRadius: 16 }]}>
                      <View style={styles.groupCardInner}>
                        <View style={[styles.groupEmoji, { width: 38, height: 38, borderRadius: 12 }]}>
                          <Text style={styles.groupEmojiText}>{g.cover_emoji}</Text>
                        </View>
                        <View style={styles.groupInfo}>
                          <Text style={styles.groupName}>{g.name}</Text>
                          <Text style={styles.groupBalanceLabel}>
                            Archived · {g.archived_at
                              ? new Date(g.archived_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                              : ''}
                          </Text>
                        </View>
                        <View style={styles.settledBadge}>
                          <Text style={styles.settledBadgeText}>Settled ✓</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push('/groups/create' as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaBtnText}>+ Create New Group</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>

      <ToastNotification message={toast} visible={toastVisible} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14,
  },
  screenTitle: { fontFamily: fonts.syne, fontSize: 22, color: colors.text },
  createBtn: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
  },
  createBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, color: colors.accent },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 110,
  },

  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text2,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },

  groupsList: { gap: 10 },
  groupCard: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border,
  },
  groupCardInner: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  groupEmoji: {
    width: 46, height: 46, borderRadius: 16,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  groupEmojiText: { fontSize: 22 },
  groupInfo: { flex: 1 },
  groupName: { fontFamily: fonts.syne, fontSize: 15, color: colors.text, marginBottom: 4 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupMemberCount: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2 },

  avStack: { flexDirection: 'row' },
  avStackItem: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.card,
  },
  avStackText: { fontSize: 6, fontFamily: fonts.dmSansSemiBold },

  groupBalance: { alignItems: 'flex-end' },
  groupBalanceAmt: { fontFamily: fonts.syne, fontSize: 15, letterSpacing: -0.5 },
  groupBalanceLabel: { fontFamily: fonts.dmSans, fontSize: 10, color: colors.text3, marginTop: 2 },
  groupBalanceSettled: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3 },
  accent: { color: colors.accent },
  danger: { color: colors.danger },

  settledBadge: {
    backgroundColor: colors.cardElevated, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  settledBadgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text3 },

  emptyState: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontFamily: fonts.syne, fontSize: 18, color: colors.text },
  emptySubtitle: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2, marginBottom: 16, textAlign: 'center' },
  emptyCtaBtn: {
    backgroundColor: colors.accent, borderRadius: 16, height: 52, paddingHorizontal: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCtaText: { fontFamily: fonts.syne, fontSize: 15, color: '#000' },

  ctaBtn: {
    backgroundColor: colors.accent, borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 20,
  },
  ctaBtnText: { fontFamily: fonts.syne, fontSize: 15, color: '#000' },
});
