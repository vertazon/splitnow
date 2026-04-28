import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatActivityDate } from '@/constants/dateFormat';
import { categories } from '@/constants/sampleData';
import { expensesQueryKey, fetchExpenses, type ExpenseWithSplits } from '@/hooks/useExpenses';
import { useMembers } from '@/hooks/useMembers';
import { DEV_USER_ID, DEV_GROUP_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function CategoryBar({
  label,
  amount,
  pct,
  barColor,
  animate,
}: {
  label: string;
  amount: number;
  pct: number;
  barColor: string;
  animate: boolean;
}) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animate) {
      Animated.timing(width, {
        toValue: pct,
        duration: 800,
        useNativeDriver: false,
        delay: 100,
      }).start();
    } else {
      width.setValue(0);
    }
  }, [animate, pct]);

  return (
    <View style={styles.catBarRow}>
      <View style={styles.catBarHeader}>
        <Text style={styles.catBarLabel}>{label}</Text>
        <Text style={styles.catBarAmount}>₹{amount.toLocaleString('en-IN')}</Text>
      </View>
      <View style={styles.catBarTrack}>
        <Animated.View
          style={[
            styles.catBarFill,
            {
              backgroundColor: barColor,
              width: width.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const BAR_COLORS = [colors.accent, colors.blue, colors.orange, colors.purple, colors.danger];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const hasAnimated = useRef(false);

  const groupId = useGroupStore(s => s.currentGroupId) ?? DEV_GROUP_ID;
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        const t = setTimeout(() => setShouldAnimate(true), 120);
        return () => clearTimeout(t);
      }
    }, [])
  );

  // Read from the shared React Query cache — same key as useExpenses in Home tab,
  // but without the realtime useEffect so we don't open a duplicate channel.
  const { data: expenses = [], isLoading } = useQuery<ExpenseWithSplits[]>({
    queryKey: expensesQueryKey(groupId),
    queryFn: () => fetchExpenses(groupId),
    enabled: !!groupId,
  });
  const { data: members = [] } = useMembers(groupId);

  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const insights = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const daysElapsed = Math.max(1, now.getDate());

    const monthExpenses = expenses.filter(e => {
      const d = new Date(e.created_at);
      return d.getFullYear() === curYear && d.getMonth() === curMonth;
    });

    const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const txCount = monthExpenses.length;
    const avgDay = txCount > 0 ? Math.round(totalMonth / daysElapsed) : 0;

    // Most with: count how many shared expenses each other member appears in
    const withCount = new Map<string, number>();
    monthExpenses.forEach(e => {
      const splits = e.splits ?? [];
      const isParticipant = splits.some(s => s.user_id === currentUserId);
      if (!isParticipant || splits.length <= 1) return;
      splits.forEach(s => {
        if (s.user_id !== currentUserId) {
          withCount.set(s.user_id, (withCount.get(s.user_id) ?? 0) + 1);
        }
      });
    });
    let mostWithName = '—';
    let mostWithCount = 0;
    withCount.forEach((count, userId) => {
      if (count > mostWithCount) {
        mostWithCount = count;
        mostWithName = members.find(m => m.id === userId)?.name ?? '—';
      }
    });

    // Category breakdown: top 5 by total spend
    const catTotals = new Map<string, number>();
    monthExpenses.forEach(e => {
      catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amount);
    });
    const sorted = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxAmount = sorted[0]?.[1] ?? 1;
    const byCategory = sorted.map(([catId, amount], idx) => {
      const cat = categories.find(c => c.id === catId);
      return {
        label: `${cat?.emoji ?? '📦'} ${cat?.label ?? catId}`,
        amount,
        pct: amount / maxAmount,
        color: BAR_COLORS[idx % BAR_COLORS.length],
      };
    });

    // Personal: solo expenses paid by current user, split only with themselves
    const personal = expenses
      .filter(e => {
        const splits = e.splits ?? [];
        return (
          e.paid_by === currentUserId &&
          splits.length === 1 &&
          splits[0].user_id === currentUserId
        );
      })
      .slice(0, 5);

    return { totalMonth, txCount, avgDay, mostWithName, mostWithCount, byCategory, personal };
  }, [expenses, members, currentUserId]);

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (isLoading && expenses.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Insights</Text>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="THIS MONTH"
            value={`₹${insights.totalMonth.toLocaleString('en-IN')}`}
            sub={monthLabel}
          />
          <StatCard
            label="EXPENSES"
            value={String(insights.txCount)}
            sub="transactions"
          />
          <StatCard
            label="MOST WITH"
            value={insights.mostWithName === '—' ? '—' : `${insights.mostWithName} 🏆`}
            sub={insights.mostWithCount > 0 ? `${insights.mostWithCount} shared` : 'no shared yet'}
          />
          <StatCard
            label="AVG / DAY"
            value={insights.avgDay > 0 ? `₹${insights.avgDay.toLocaleString('en-IN')}` : '₹0'}
            sub="this month"
          />
        </View>

        {/* By Category */}
        {insights.byCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BY CATEGORY</Text>
            <View style={styles.card}>
              {insights.byCategory.map(cat => (
                <CategoryBar
                  key={cat.label}
                  label={cat.label}
                  amount={cat.amount}
                  pct={cat.pct}
                  barColor={cat.color}
                  animate={shouldAnimate}
                />
              ))}
            </View>
          </View>
        )}

        {/* Personal expenses */}
        {insights.personal.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PERSONAL</Text>
            <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
              {insights.personal.map((exp, i) => {
                const cat = categories.find(c => c.id === exp.category);
                return (
                  <View key={exp.id}>
                    <View style={styles.expenseRow}>
                      <View style={styles.expenseIcon}>
                        <Text style={{ fontSize: 16 }}>{cat?.emoji ?? '📦'}</Text>
                      </View>
                      <View style={styles.expenseInfo}>
                        <Text style={styles.expenseTitle}>{exp.title}</Text>
                        <Text style={styles.expenseSub}>{formatActivityDate(exp.created_at)}</Text>
                      </View>
                      <Text style={styles.expenseAmount}>
                        ₹{exp.amount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    {i < insights.personal.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Empty state */}
        {insights.txCount === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No expenses yet</Text>
            <Text style={styles.emptySub}>Add some expenses to see your spending insights.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 14,
    width: '47.5%',
  },
  statLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 6,
  },
  statValue: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  statSub: {
    fontFamily: fonts.dmSans,
    fontSize: 10,
    color: colors.text2,
    marginTop: 3,
  },
  section: { marginBottom: 20 },
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
    padding: 18,
  },
  catBarRow: { marginBottom: 14 },
  catBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catBarLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  catBarAmount: {
    fontFamily: fonts.syne,
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  catBarTrack: {
    backgroundColor: colors.cardElevated,
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
  },
  catBarFill: { height: 6, borderRadius: 3 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expenseInfo: { flex: 1 },
  expenseTitle: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  expenseSub: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
    marginTop: 1,
  },
  expenseAmount: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontFamily: fonts.syne,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
  },
});
