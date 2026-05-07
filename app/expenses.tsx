import type { MemberLite } from '@/components/ActivityRow';
import { ActivityRow, getNetBalance } from '@/components/ActivityRow';
import { formatAmount } from '@/constants/amountUtils';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { fetchExpenses, type ExpenseWithSplits } from '@/hooks/useExpenses';
import { useGroupDetail, useGroups } from '@/hooks/useGroups';
import { fetchMembersForGroup, useMembers } from '@/hooks/useMembers';
import { DEV_USER_ID } from '@/lib/auth';
import { qk } from '@/lib/queryKeys';
import { useGroupStore } from '@/store/useGroupStore';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor } from '@/types/database';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Filter tabs ─────────────────────────────────────────────────────────────

type Filter = 'all' | 'lent' | 'owed' | 'personal';

const SHARED_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',  label: 'All'  },
  { id: 'lent', label: 'Lent' },
  { id: 'owed', label: 'Owed' },
];

const PERSONAL_FILTERS: { id: Filter; label: string }[] = [
  { id: 'personal', label: 'Personal' },
];

const ALL_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'lent',     label: 'Lent'     },
  { id: 'owed',     label: 'Owed'     },
  { id: 'personal', label: 'Personal' },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const isAllMode = !groupId;

  // All-mode: need all group IDs to fan out queries
  const { data: groups = [] } = useGroups(currentUserId);
  const activeGroups = groups.filter(g => !g.archived_at);
  const allGroupIds = activeGroups.map(g => g.id);

  // Single-group: read from the shared cache (no second realtime channel)
  const { data: singleExpenses = [], isLoading: singleLoading, error: singleError } = useQuery<ExpenseWithSplits[]>({
    queryKey: qk.expenses.list(groupId),
    queryFn: () => fetchExpenses(groupId as string),
    enabled: !!groupId,
  });
  const { data: singleMembers = [] } = useMembers(groupId);
  const { data: group } = useGroupDetail(groupId);

  // All-mode: fan out across every active group
  const allExpensesResults = useQueries({
    queries: allGroupIds.map(id => ({
      queryKey: qk.expenses.list(id),
      queryFn: () => fetchExpenses(id),
      enabled: isAllMode && allGroupIds.length > 0,
    })),
  });
  const allMembersResults = useQueries({
    queries: allGroupIds.map(id => ({
      queryKey: qk.members.list(id),
      queryFn: () => fetchMembersForGroup(id),
      enabled: isAllMode && allGroupIds.length > 0,
    })),
  });

  // Merge based on mode
  const expenses: ExpenseWithSplits[] = isAllMode
    ? allExpensesResults
        .flatMap(r => r.data ?? [])
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : singleExpenses;

  const allMembers = isAllMode
    ? (() => {
        const seen = new Set<string>();
        return allMembersResults.flatMap(r => r.data ?? []).filter(m => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
      })()
    : singleMembers;

  const isLoading = isAllMode
    ? allExpensesResults.some(r => r.isLoading)
    : singleLoading;
  const error = isAllMode
    ? (allExpensesResults.find(r => r.error)?.error ?? null)
    : singleError;

  // Group badge map for All-mode rows
  const groupBadgeMap = new Map<string, string>(
    activeGroups.map(g => [g.id, `${g.cover_emoji} ${g.name}`])
  );

  const isPersonalGroup = group?.group_type === 'personal';

  // Which filter chips to show depends on the group context:
  // • Personal group  → only "Personal" (lent/owed are meaningless here)
  // • Shared group    → "All", "Lent", "Owed" (no Personal)
  // • All mode (null) → all four filters
  const visibleFilters = isAllMode
    ? ALL_FILTERS
    : isPersonalGroup
      ? PERSONAL_FILTERS
      : SHARED_FILTERS;

  const [activeFilter, setActiveFilter] = useState<Filter>(() =>
    isPersonalGroup ? 'personal' : 'all'
  );

  // If the active filter isn't visible in the current context, reset it
  const safeFilter = visibleFilters.find(f => f.id === activeFilter)
    ? activeFilter
    : visibleFilters[0].id;

  const memberMap = useMemo(
    () => new Map<string, MemberLite>(
      allMembers.map(m => [m.id, { id: m.id, name: m.name ?? m.id, color: (m.avatar_color ?? 'green') as AvatarColor }])
    ),
    [allMembers]
  );

  const filtered = useMemo(() => {
    if (safeFilter === 'all') return expenses;
    return expenses.filter(e => getNetBalance(e, currentUserId).type === safeFilter);
  }, [expenses, safeFilter, currentUserId]);

  // Summary line
  const totalNet = useMemo(() => {
    return filtered.reduce((sum, e) => {
      const net = getNetBalance(e, currentUserId);
      if (net.type === 'lent') return sum + net.amount;
      if (net.type === 'owed') return sum - net.amount;
      return sum;
    }, 0);
  }, [filtered, currentUserId]);

  const renderItem = ({ item, index }: { item: ExpenseWithSplits; index: number }) => (
    <View>
      <ActivityRow
        exp={item}
        memberMap={memberMap}
        currentUserId={currentUserId}
        onPress={() => router.push(`/expense/${item.id}` as never)}
        groupBadge={isAllMode ? groupBadgeMap.get(item.group_id) : undefined}
      />
      {index < filtered.length - 1 && <View style={styles.divider} />}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>All Expenses</Text>
        <Text style={styles.count}>{expenses.length}</Text>
      </View>

      {/* Filter chips — only rendered when there is more than one option */}
      {visibleFilters.length > 1 && (
        <View style={styles.filterRow}>
          {visibleFilters.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, safeFilter === f.id && styles.filterChipActive]}
              onPress={() => setActiveFilter(f.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterLabel, safeFilter === f.id && styles.filterLabelActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Net summary */}
      {filtered.length > 0 && safeFilter !== 'personal' && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}
          </Text>
          <Text style={[
            styles.summaryNet,
            { color: totalNet >= 0 ? colors.accent : colors.danger },
          ]}>
            {totalNet >= 0 ? '+' : '−'}{formatAmount(Math.abs(totalNet))}
          </Text>
        </View>
      )}

      {/* List */}
      {isLoading && expenses.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load expenses.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🗂️</Text>
          <Text style={styles.emptyTitle}>Nothing here</Text>
          <Text style={styles.emptySub}>
            {safeFilter === 'all'
              ? 'Add your first expense to get started.'
              : `No ${safeFilter} expenses yet.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => e.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          ItemSeparatorComponent={null}
          ListFooterComponent={
            <View style={{ alignItems: 'center', paddingVertical: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }}>
              {expenses.length >= 100 && (
                <Text style={styles.limitNote}>Showing most recent 100 expenses</Text>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: colors.text,
    lineHeight: 26,
    marginTop: -2,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  count: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text2,
    backgroundColor: colors.cardElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    minHeight: 32,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  filterLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text2,
  },
  filterLabelActive: {
    color: colors.accent,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  summaryText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
  },
  summaryNet: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
  },
  list: { flex: 1 },
  listContent: {
    marginHorizontal: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.danger,
  },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  emptySub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  limitNote: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text3,
  },
});
