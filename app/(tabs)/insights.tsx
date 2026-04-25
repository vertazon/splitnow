import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { insightsData, personalExpenses } from '@/constants/sampleData';

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
  }, [animate]);

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

export default function InsightsScreen() {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const hasAnimated = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        const t = setTimeout(() => setShouldAnimate(true), 120);
        return () => clearTimeout(t);
      }
    }, [])
  );

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
            value={`₹${insightsData.totalMonth.toLocaleString('en-IN')}`}
            sub="Apr 2026"
          />
          <StatCard
            label="EXPENSES"
            value={String(insightsData.expenses)}
            sub="transactions"
          />
          <StatCard
            label="MOST WITH"
            value={`${insightsData.mostWith} 🏆`}
            sub={`${insightsData.mostWithCount} shared`}
          />
          <StatCard
            label="AVG / DAY"
            value={`₹${insightsData.avgDay}`}
            sub="this month"
          />
        </View>

        {/* By Category */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BY CATEGORY</Text>
          <View style={styles.card}>
            {insightsData.byCategory.map(cat => (
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

        {/* Personal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PERSONAL</Text>
          <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
            {personalExpenses.map((exp, i) => (
              <View key={exp.id}>
                <View style={styles.expenseRow}>
                  <View style={styles.expenseIcon}>
                    <Text style={{ fontSize: 16 }}>{exp.emoji}</Text>
                  </View>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseTitle}>{exp.title}</Text>
                    <Text style={styles.expenseSub}>{exp.date}</Text>
                  </View>
                  <Text style={styles.expenseAmount}>
                    ₹{exp.amount.toLocaleString('en-IN')}
                  </Text>
                </View>
                {i < personalExpenses.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
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
  section: {
    marginBottom: 20,
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
  catBarRow: {
    marginBottom: 14,
  },
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
  catBarFill: {
    height: 6,
    borderRadius: 3,
  },
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
  expenseInfo: {
    flex: 1,
  },
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
});
