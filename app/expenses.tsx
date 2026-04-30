import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import type { AvatarColor } from '@/types/database';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useExpenses, type ExpenseWithSplits } from '@/hooks/useExpenses';
import { useMembers } from '@/hooks/useMembers';
import { ActivityRow, NET_COLORS, getNetBalance } from '@/components/ActivityRow';
import type { MemberLite } from '@/components/ActivityRow';

// ─── Filter tabs ─────────────────────────────────────────────────────────────

type Filter = 'all' | 'lent' | 'owed' | 'personal';

const FILTERS: { id: Filter; label: string }[] = [
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

  const { data: expenses = [], isLoading, error } = useExpenses(groupId);
  const { data: members = [] } = useMembers(groupId);

  const [activeFilter, setActiveFilter] = useState<Filter>('all');

  const memberMap = useMemo(
    () => new Map<string, MemberLite>(
      members.map(m => [m.id, { id: m.id, name: m.name ?? m.id, color: (m.avatar_color ?? 'green') as AvatarColor }])
    ),
    [members]
  );

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return expenses;
    return expenses.filter(e => getNetBalance(e, currentUserId).type === activeFilter);
  }, [expenses, activeFilter, currentUserId]);

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

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, activeFilter === f.id && styles.filterChipActive]}
            onPress={() => setActiveFilter(f.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterLabel, activeFilter === f.id && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Net summary */}
      {filtered.length > 0 && activeFilter !== 'personal' && (
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
            {activeFilter === 'all'
              ? 'Add your first expense to get started.'
              : `No ${activeFilter} expenses yet.`}
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
          ListFooterComponent={<View style={{ height: Platform.OS === 'ios' ? 40 : 20 }} />}
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
    fontSize: 12,
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
    fontSize: 12,
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
});
