import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  // Linking, // UPI deeplinks — disabled until UPI settlement is re-enabled
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import type { Balance, AvatarColor } from '@/types/database';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { fetchExpenses } from '@/hooks/useExpenses';
import { fetchBalancesForGroup } from '@/hooks/useBalances';
import { fetchMembersForGroup } from '@/hooks/useMembers';
import { useGroups } from '@/hooks/useGroups';
import { useSettleUp } from '@/hooks/useSettlements';
import { BalanceRow } from '@/components/BalanceCard';
import { ToastNotification } from '@/components/ToastNotification';
import { ActivityRow } from '@/components/ActivityRow';
import type { MemberLite } from '@/components/ActivityRow';
import { qk } from '@/lib/queryKeys';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const setCurrentGroupId = useGroupStore(s => s.setCurrentGroupId);
  const clearGroup = useGroupStore(s => s.clearGroup);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: groups = [] } = useGroups(currentUserId);
  const activeGroups = groups
    .filter(g => !g.archived_at)
    .sort((a, b) => {
      if (a.group_type === 'personal') return -1;
      if (b.group_type === 'personal') return 1;
      return 0;
    });
  const allGroupIds = activeGroups.map(g => g.id);

  // Fetch expenses, balances, and members for every active group.
  // useQueries runs them in parallel and leverages the shared cache,
  // so switching between "All" and individual groups is instant.
  const expensesResults = useQueries({
    queries: allGroupIds.map(id => ({
      queryKey: qk.expenses.list(id),
      queryFn: () => fetchExpenses(id),
      enabled: allGroupIds.length > 0,
    })),
  });

  const balancesResults = useQueries({
    queries: allGroupIds.map(id => ({
      queryKey: qk.balances.list(id, currentUserId),
      queryFn: () => fetchBalancesForGroup(id, currentUserId),
      enabled: allGroupIds.length > 0,
    })),
  });

  const membersResults = useQueries({
    queries: allGroupIds.map(id => ({
      queryKey: qk.members.list(id),
      queryFn: () => fetchMembersForGroup(id),
      enabled: allGroupIds.length > 0,
    })),
  });

  // Merge all data across groups, sorted newest-first
  const allExpenses = expensesResults
    .flatMap(r => r.data ?? [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // For a selected group, filter; for "All", show everything
  const expenses = groupId
    ? allExpenses.filter(e => e.group_id === groupId)
    : allExpenses;

  // For balances: single-group → use that group's result; All → aggregate per counterparty
  const singleGroupBalances = groupId
    ? (balancesResults[allGroupIds.indexOf(groupId)]?.data ?? [])
    : [];

  const aggregatedBalances: Balance[] = (() => {
    if (groupId) return singleGroupBalances;
    const map = new Map<string, Balance>();
    balancesResults.flatMap(r => r.data ?? []).forEach(b => {
      const existing = map.get(b.userId);
      if (existing) {
        map.set(b.userId, { ...existing, amount: parseFloat((existing.amount + b.amount).toFixed(2)) });
      } else {
        map.set(b.userId, { ...b });
      }
    });
    return Array.from(map.values()).filter(b => Math.abs(b.amount) >= 0.01);
  })();

  const balances = aggregatedBalances;
  const netAmt = parseFloat(balances.reduce((s, b) => s + b.amount, 0).toFixed(2));

  // Combined member map across all groups for ActivityRow name resolution
  const allMembers = membersResults.flatMap(r => r.data ?? []);

  const expLoading = expensesResults.some(r => r.isLoading);
  const balLoading = balancesResults.some(r => r.isLoading);
  const expError = expensesResults.find(r => r.error)?.error ?? null;

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      qc.refetchQueries({ queryKey: qk.expenses.all }),
      qc.refetchQueries({ queryKey: qk.balances.all }),
      qc.refetchQueries({ queryKey: qk.members.all }),
    ]).finally(() => setRefreshing(false));
  }, [qc]);

  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const settleUp = useSettleUp();

  const handlePay = useCallback(async (b: Balance) => {
    try {
      if (groupId) {
        // Single-group context — settle the full balance in that group
        await settleUp.mutateAsync({ groupId, toUserId: b.userId, amount: Math.abs(b.amount) });
      } else {
        // "All" context — find every group where we owe this person and settle each
        const debts = allGroupIds
          .map((gid, i) => ({
            gid,
            bal: balancesResults[i]?.data?.find(x => x.userId === b.userId && x.amount < 0),
          }))
          .filter((x): x is { gid: string; bal: Balance } => !!x.bal);

        await Promise.all(
          debts.map(({ gid, bal }) =>
            settleUp.mutateAsync({ groupId: gid, toUserId: b.userId, amount: Math.abs(bal.amount) })
          )
        );
      }
      showToast(`Settled with ${b.name} ✓`);
    } catch {
      showToast('Could not record settlement');
    }
  }, [groupId, allGroupIds, balancesResults, settleUp, showToast]);

  // Map for fast lookup inside ActivityRow + MiniAvatars — covers all groups
  const memberMap = new Map<string, MemberLite>(
    allMembers.map(m => [m.id, { id: m.id, name: m.name ?? m.id, color: (m.avatar_color ?? 'green') as AvatarColor }])
  );

  // Map group_id → badge string for activity rows (shown when viewing "All" context)
  const groupBadgeMap = new Map<string, string>(
    activeGroups.map(g => [g.id, `${g.cover_emoji} ${g.name}`])
  );

  const isOwed = netAmt >= 0;
  const owedToCount = balances.filter(b => b.amount < 0).length;
  const owesYouCount = balances.filter(b => b.amount > 0).length;

  const isLoading = expLoading || balLoading;

  // Personal group context
  const currentGroup = activeGroups.find(g => g.id === groupId);
  const isPersonalGroup = currentGroup?.group_type === 'personal';

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const now = new Date();
  const thisMonthCount = expenses.filter(e => {
    const d = new Date(e.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  // Current user profile for header
  const currentUser = useUserStore(s => s.currentUser);
  const firstName = currentUser?.name?.split(' ')[0] ?? 'there';
  const avatarColor = (currentUser?.avatar_color ?? 'green') as AvatarColor;
  const av = avatarColors[avatarColor] ?? avatarColors.green;
  const userInitials = currentUser?.name ? initialsFromName(currentUser.name) : '?';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
            <Text style={styles.greeting}>Hey {firstName} 👋</Text>
            <Text style={styles.month}>
              {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/account' as never)} activeOpacity={0.75}>
            <View style={[styles.avatar, { backgroundColor: av.bg }]}>
              <Text style={[styles.avatarText, { color: av.text }]}>{userInitials}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Group context chip row — only shown when user has groups */}
        {activeGroups.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.groupChipScroll}
            contentContainerStyle={styles.groupChipContent}
          >
            <TouchableOpacity
              style={[styles.groupChip, !groupId && styles.groupChipOn]}
              onPress={clearGroup}
              activeOpacity={0.7}
            >
              <Text style={[styles.groupChipText, !groupId && styles.groupChipTextOn]}>All</Text>
            </TouchableOpacity>
            {activeGroups.map(g => (
              <TouchableOpacity
                key={g.id}
                style={[styles.groupChip, groupId === g.id && styles.groupChipOn]}
                onPress={() => setCurrentGroupId(g.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.groupChipText, groupId === g.id && styles.groupChipTextOn]}>
                  {g.cover_emoji} {g.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.groupChip, styles.groupChipAdd]}
              onPress={() => router.push('/groups/create' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.groupChipAddText}>+ New</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Summary card — spending for personal group, net balance otherwise */}
        {isPersonalGroup ? (
          <View style={[styles.card, styles.balanceCardNeutral]}>
            <Text style={styles.sectionLabel}>PERSONAL SPENDING</Text>
            {expLoading && expenses.length === 0 ? (
              <ActivityIndicator color={colors.text2} style={{ marginVertical: 12 }} />
            ) : (
              <>
                <Text style={[styles.balanceAmount, { color: colors.text }]}>
                  {formatAmount(totalSpent)}
                </Text>
                <Text style={styles.balanceSub}>
                  {thisMonthCount > 0
                    ? `${thisMonthCount} ${thisMonthCount === 1 ? 'expense' : 'expenses'} this month`
                    : 'No expenses this month yet'}
                </Text>
              </>
            )}
          </View>
        ) : (
          <>
            <View style={[styles.card, isOwed ? styles.balanceCardAccent : styles.balanceCardDanger]}>
              <Text style={styles.sectionLabel}>NET BALANCE</Text>
              {balLoading && balances.length === 0 ? (
                <ActivityIndicator color={colors.text2} style={{ marginVertical: 12 }} />
              ) : (
                <>
                  <Text style={[styles.balanceAmount, isOwed ? styles.accent : styles.danger]}>
                    {isOwed ? '+' : '−'}{formatAmount(Math.abs(netAmt))}
                  </Text>
                  <Text style={styles.balanceSub}>
                    {balances.length === 0
                      ? 'All settled up ✓'
                      : isOwed
                        ? `from ${owesYouCount} ${owesYouCount === 1 ? 'person' : 'people'}`
                        : `to ${owedToCount} ${owedToCount === 1 ? 'person' : 'people'}`}
                  </Text>
                </>
              )}
            </View>

            {/* Balances */}
            {balances.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>BALANCES</Text>
                <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
                  {balances.map((b, i) => (
                    <View key={b.userId}>
                      <BalanceRow balance={b} onPay={handlePay} />
                      {i < balances.length - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>RECENT EXPENSES</Text>
            {expenses.length > 5 && (
              <TouchableOpacity onPress={() => router.push('/expenses' as never)} activeOpacity={0.7}>
                <Text style={styles.seeAll}>See all ({expenses.length}) →</Text>
              </TouchableOpacity>
            )}
          </View>
          {isLoading && expenses.length === 0 ? (
            <View style={[styles.card, styles.loadingCard]}>
              <ActivityIndicator color={colors.text2} />
            </View>
          ) : expError ? (
            <View style={[styles.card, styles.loadingCard]}>
              <Text style={styles.errorText}>Couldn&apos;t load expenses. Pull to refresh.</Text>
            </View>
          ) : expenses.length === 0 ? (
            <View style={[styles.card, styles.loadingCard]}>
              <Text style={styles.emptyText}>No expenses yet. Tap + to add one.</Text>
            </View>
          ) : (
            <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
              {expenses.slice(0, 5).map((exp, i, arr) => (
                <View key={exp.id}>
                  <ActivityRow
                    exp={exp}
                    memberMap={memberMap}
                    currentUserId={currentUserId}
                    onPress={() => router.push(`/expense/${exp.id}` as never)}
                    groupBadge={!groupId ? groupBadgeMap.get(exp.group_id) : undefined}
                  />
                  {i < arr.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <ToastNotification message={toast} visible={toastVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  greeting: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    marginBottom: 1,
  },
  month: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 16,
  },
  balanceCardDanger: {
    marginBottom: 16,
    backgroundColor: colors.dangerDim,
    borderColor: colors.dangerBorder,
  },
  balanceCardAccent: {
    marginBottom: 16,
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  balanceCardNeutral: {
    marginBottom: 16,
    backgroundColor: colors.cardElevated,
    borderColor: colors.borderEmphasis,
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
  balanceAmount: {
    fontFamily: fonts.syne,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 4,
  },
  accent: { color: colors.accent },
  danger: { color: colors.danger },
  balanceSub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
  },
  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  seeAll: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
  loadingCard: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text3,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },

  // Group context chips
  groupChipScroll: { marginBottom: 10, flexGrow: 0 },
  groupChipContent: { gap: 8, paddingBottom: 2 },
  groupChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.cardElevated, borderWidth: 1.5, borderColor: colors.borderEmphasis,
  },
  groupChipOn: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  groupChipText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text2 },
  groupChipTextOn: { color: colors.accent },
  groupChipAdd: { borderStyle: 'dashed' },
  groupChipAddText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text3 },

});
