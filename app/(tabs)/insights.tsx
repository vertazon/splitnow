import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatDisplayName } from '@/constants/amountUtils';
import { categories } from '@/constants/sampleData';
import { fetchExpenses, type ExpenseWithSplits } from '@/hooks/useExpenses';
import { fetchMembersForGroup } from '@/hooks/useMembers';
import { qk } from '@/lib/queryKeys';
import { useGroups } from '@/hooks/useGroups';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types/database';

// ─── Sub-components ───────────────────────────────────────────────────────────

// Full-width hero card — THIS MONTH
function HeroStatCard({ value, sub }: { value: string; sub: string }) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroLeft}>
        <Text style={styles.heroLabel}>THIS MONTH</Text>
        <Text style={styles.heroValue}>{value}</Text>
      </View>
      <View style={styles.heroRight}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>{sub}</Text>
        </View>
      </View>
    </View>
  );
}

// Small info card — EXPENSES / AVG PER DAY
function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

// Full-width social card — MOST WITH
function MostWithCard({ name, count }: { name: string; count: number }) {
  const displayName = formatDisplayName(name);
  return (
    <View style={styles.mostWithCard}>
      <Text style={styles.statLabel}>MOST WITH</Text>
      <Text style={styles.mostWithName}>
        {displayName === '—' ? '—' : `${displayName} 🏆`}
      </Text>
      <Text style={styles.mostWithCount}>
        {count > 0 ? `${count} shared expenses` : 'no shared yet'}
      </Text>
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

// ─── Monthly Trend Card ───────────────────────────────────────────────────────

const TREND_MAX_H = 96; // max bar height in px

function TrendBar({
  label,
  amount,
  pct,
  color,
  dimColor,
  animate,
  delay,
  isThis,
}: {
  label: string;
  amount: number;
  pct: number;
  color: string;
  dimColor: string;
  animate: boolean;
  delay: number;
  isThis: boolean;
}) {
  const height = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animate) {
      Animated.timing(height, {
        toValue: Math.max(pct * TREND_MAX_H, pct > 0 ? 6 : 0),
        duration: 650,
        useNativeDriver: false,
        delay,
      }).start();
    } else {
      height.setValue(0);
    }
  }, [animate, pct, delay]);

  return (
    <View style={trendStyles.col}>
      {/* Amount above bar */}
      <Text style={[trendStyles.colAmount, { color }]}>
        {amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : '—'}
      </Text>
      {/* Bar grows upward from bottom of fixed-height container */}
      <View style={trendStyles.barWell}>
        <Animated.View
          style={[
            trendStyles.bar,
            {
              height,
              backgroundColor: color,
              // Pill top corners only when bar has substance
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
            },
          ]}
        />
      </View>
      {/* Month label */}
      <Text style={[trendStyles.colLabel, isThis && { color: colors.text }]}>{label}</Text>
      {/* Active dot for current month */}
      {isThis && <View style={[trendStyles.dot, { backgroundColor: color }]} />}
    </View>
  );
}

const trendStyles = StyleSheet.create({
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  colAmount: {
    fontFamily: fonts.syne,
    fontSize: 13,
    fontWeight: '800',
  },
  barWell: {
    width: '72%',
    height: TREND_MAX_H,
    backgroundColor: colors.cardElevated,
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
  },
  colLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: -4,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const qc = useQueryClient();

  // Local group selection — null means "All Groups"
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const { data: groups = [] } = useGroups(currentUserId);
  const activeGroups = groups.filter(g => !g.archived_at);
  const allGroupIds = activeGroups.map(g => g.id);

  // True when a specific personal group is selected (not All mode)
  const selectedGroup = activeGroups.find(g => g.id === selectedGroupId);
  const isPersonalContext = selectedGroup?.group_type === 'personal';

  // Animation state — reset whenever the selected group changes
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const animKey = useRef(0);

  const triggerAnimation = useCallback(() => {
    setShouldAnimate(false);
    animKey.current += 1;
    const t = setTimeout(() => setShouldAnimate(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Animate on first focus
  useFocusEffect(
    useCallback(() => {
      const cleanup = triggerAnimation();
      return cleanup;
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Re-animate when group selection changes
  const prevGroupId = useRef(selectedGroupId);
  useEffect(() => {
    if (prevGroupId.current !== selectedGroupId) {
      prevGroupId.current = selectedGroupId;
      triggerAnimation();
    }
  }, [selectedGroupId, triggerAnimation]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      qc.refetchQueries({ queryKey: qk.expenses.all }),
      qc.refetchQueries({ queryKey: qk.members.all }),
    ]).finally(() => setRefreshing(false));
  }, [qc]);

  // Fetch expenses + members for all groups in parallel
  const expensesResults = useQueries({
    queries: allGroupIds.map(id => ({
      queryKey: qk.expenses.list(id),
      queryFn: () => fetchExpenses(id),
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

  const isLoading = expensesResults.some(r => r.isLoading);

  // Derive expenses and members for the selected context
  const expenses: ExpenseWithSplits[] = useMemo(() => {
    if (selectedGroupId) {
      const idx = allGroupIds.indexOf(selectedGroupId);
      return expensesResults[idx]?.data ?? [];
    }
    return expensesResults
      .flatMap(r => r.data ?? [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [selectedGroupId, expensesResults, allGroupIds]);

  const members: User[] = useMemo(() => {
    if (selectedGroupId) {
      const idx = allGroupIds.indexOf(selectedGroupId);
      return membersResults[idx]?.data ?? [];
    }
    // Deduplicate by id when merging all groups
    const seen = new Set<string>();
    return membersResults.flatMap(r => r.data ?? []).filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [selectedGroupId, membersResults, allGroupIds]);

  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const insights = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const daysElapsed = Math.max(1, now.getDate());

    // Last month bounds
    const lastMonthDate = new Date(curYear, curMonth - 1, 1);
    const lastYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    const isInvolved = (e: ExpenseWithSplits) =>
      e.paid_by === currentUserId || (e.splits ?? []).some(s => s.user_id === currentUserId);

    const monthExpenses = expenses.filter(e => {
      const d = new Date(e.created_at);
      return d.getFullYear() === curYear && d.getMonth() === curMonth && isInvolved(e);
    });

    const lastMonthExpenses = expenses.filter(e => {
      const d = new Date(e.created_at);
      return d.getFullYear() === lastYear && d.getMonth() === lastMonth && isInvolved(e);
    });

    const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const totalLastMonth = lastMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const txCount = monthExpenses.length;
    const avgDay = txCount > 0 ? Math.round(totalMonth / daysElapsed) : 0;

    // Most with
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

    // Category breakdown: top 5
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

    // Month-over-month delta
    const trendDelta = totalLastMonth > 0
      ? Math.round(((totalMonth - totalLastMonth) / totalLastMonth) * 100)
      : null; // null = no last-month data to compare

    return { totalMonth, totalLastMonth, trendDelta, txCount, avgDay, mostWithName, mostWithCount, byCategory };
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <Text style={styles.title}>Insights</Text>

        {/* Group filter chips */}
        {activeGroups.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipContent}
          >
            <TouchableOpacity
              style={[styles.chip, !selectedGroupId && styles.chipOn]}
              onPress={() => setSelectedGroupId(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, !selectedGroupId && styles.chipTextOn]}>
                All Groups
              </Text>
            </TouchableOpacity>
            {activeGroups.map(g => (
              <TouchableOpacity
                key={g.id}
                style={[styles.chip, selectedGroupId === g.id && styles.chipOn]}
                onPress={() => setSelectedGroupId(g.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, selectedGroupId === g.id && styles.chipTextOn]}>
                  {g.cover_emoji} {g.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Stats — hero + supporting row + social */}
        <View style={styles.statsStack}>
          {/* Hero: THIS MONTH */}
          <HeroStatCard
            value={`₹${insights.totalMonth.toLocaleString('en-IN')}`}
            sub={monthLabel}
          />

          {/* Supporting row */}
          <View style={styles.statsRow}>
            <StatCard
              label="EXPENSES"
              value={String(insights.txCount)}
              sub="transactions"
            />
            <StatCard
              label="AVG / DAY"
              value={insights.avgDay > 0 ? `₹${insights.avgDay.toLocaleString('en-IN')}` : '₹0'}
              sub="this month"
            />
          </View>

          {/* Social: MOST WITH — hidden for personal groups */}
          {!isPersonalContext && (
            <MostWithCard
              name={insights.mostWithName}
              count={insights.mostWithCount}
            />
          )}
        </View>

        {/* Monthly Trend */}
        {(insights.totalMonth > 0 || insights.totalLastMonth > 0) && (() => {
          const maxVal = Math.max(insights.totalMonth, insights.totalLastMonth, 1);
          const now = new Date();
          const thisMonthLabel = now.toLocaleDateString('en-IN', { month: 'long' });
          const lastMonthLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            .toLocaleDateString('en-IN', { month: 'long' });
          const delta = insights.trendDelta;
          const isUp = delta !== null && delta > 0;
          const isDown = delta !== null && delta < 0;

          return (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>MONTHLY TREND</Text>
                {delta !== null && (
                  <Text style={[
                    styles.trendDelta,
                    isDown ? styles.trendDown : isUp ? styles.trendUp : styles.trendFlat,
                  ]}>
                    {isUp ? '↑' : isDown ? '↓' : '='}{Math.abs(delta)}% vs last month
                  </Text>
                )}
              </View>
              <View style={[styles.card, styles.trendCard]}>
                <TrendBar
                  label={thisMonthLabel}
                  amount={insights.totalMonth}
                  pct={insights.totalMonth / maxVal}
                  color={colors.accent}
                  dimColor={colors.accentDim}
                  animate={shouldAnimate}
                  delay={60}
                  isThis
                />
                <View style={styles.trendDivider} />
                <TrendBar
                  label={lastMonthLabel}
                  amount={insights.totalLastMonth}
                  pct={insights.totalLastMonth / maxVal}
                  color={colors.text3}
                  dimColor={colors.cardElevated}
                  animate={shouldAnimate}
                  delay={180}
                  isThis={false}
                />
              </View>
            </View>
          );
        })()}

        {/* By Category */}
        {insights.byCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BY CATEGORY</Text>
            <View style={styles.card}>
              {insights.byCategory.map(cat => (
                <CategoryBar
                  key={`${animKey.current}-${cat.label}`}
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
    marginBottom: 14,
  },

  // Group filter chips
  chipScroll: { marginBottom: 18, flexGrow: 0 },
  chipContent: { gap: 8, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.borderEmphasis,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  chipText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text2 },
  chipTextOn: { color: colors.accent },

  // ── Stats layout ──
  statsStack: { gap: 10, marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },

  // Hero card
  heroCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLeft: { gap: 6 },
  heroLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
  },
  heroValue: {
    fontFamily: fonts.syne,
    fontSize: 36,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -1,
  },
  heroRight: { alignItems: 'flex-end' },
  heroBadge: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentMid,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },

  // Small stat card
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 16,
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
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  statSub: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text2,
    marginTop: 4,
  },

  // Most With card
  mostWithCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  mostWithName: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  mostWithCount: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    marginTop: 3,
  },
  section: { marginBottom: 20 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trendDelta: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
  },
  trendUp: { color: colors.danger },
  trendDown: { color: colors.accent },
  trendFlat: { color: colors.text2 },
  trendCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 20,
    gap: 0,
  },
  trendDivider: {
    width: 1,
    height: 80,
    backgroundColor: colors.border,
    alignSelf: 'center',
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  catBarAmount: {
    fontFamily: fonts.syne,
    fontSize: 13,
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
