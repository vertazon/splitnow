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
import { useQueryClient } from '@tanstack/react-query';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import type { Balance, AvatarColor } from '@/types/database';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useExpenses, type ExpenseWithSplits } from '@/hooks/useExpenses';
import { useBalances, useNetBalance } from '@/hooks/useBalances';
import { useMembers } from '@/hooks/useMembers';
import { BalanceRow } from '@/components/BalanceCard';
import { ToastNotification } from '@/components/ToastNotification';
import { ActivityRow } from '@/components/ActivityRow';
import type { MemberLite } from '@/components/ActivityRow';
import { qk } from '@/lib/queryKeys';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: expenses = [], isLoading: expLoading, error: expError } = useExpenses(groupId);
  const { data: balances = [], isLoading: balLoading } = useBalances(groupId);
  const { net: netAmt } = useNetBalance(groupId);
  const { data: members = [] } = useMembers(groupId);

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

  const handlePay = useCallback((b: Balance) => {
    // UPI deeplink — disabled until UPI settlement is re-enabled
    // if (b.upiId) {
    //   const amt = Math.abs(b.amount);
    //   const url = `upi://pay?pa=${b.upiId}&pn=${b.name}&am=${amt}&cu=INR`;
    //   Linking.openURL(url).catch(() => {});
    // }
    showToast(`Marked as paid to ${b.name} ✓`);
  }, [showToast]);

  // Map for fast lookup inside ActivityRow + MiniAvatars
  const memberMap = new Map<string, MemberLite>(
    members.map(m => [m.id, { id: m.id, name: m.name ?? m.id, color: (m.avatar_color ?? 'green') as AvatarColor }])
  );

  const isOwed = netAmt >= 0;
  const owedToCount = balances.filter(b => b.amount < 0).length;
  const owesYouCount = balances.filter(b => b.amount > 0).length;

  const isLoading = expLoading || balLoading;

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

        {/* Net Balance Card */}
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

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>RECENT ACTIVITY</Text>
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
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  greeting: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text2,
    marginBottom: 3,
  },
  month: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
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
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -2,
    marginBottom: 4,
  },
  accent: { color: colors.accent },
  danger: { color: colors.danger },
  balanceSub: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
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
    fontSize: 11,
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
});
