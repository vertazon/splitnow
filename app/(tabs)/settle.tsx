import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  // Linking, // UPI deeplinks — disabled until UPI settlement is re-enabled
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import { ToastNotification } from '@/components/ToastNotification';
import { useBalances } from '@/hooks/useBalances';
import { useSettleUp } from '@/hooks/useSettlements';
import { useGroupStore } from '@/store/useGroupStore';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryKeys';
import type { Balance } from '@/types/database';

export default function SettleScreen() {
  const groupId = useGroupStore(s => s.currentGroupId);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      qc.refetchQueries({ queryKey: qk.balances.all }),
      qc.refetchQueries({ queryKey: qk.settlements.all }),
    ]).finally(() => setRefreshing(false));
  }, [qc]);

  const { data: balances = [], isLoading } = useBalances(groupId);
  const settleUp = useSettleUp();

  const owedBalances = balances.filter(b => b.amount < 0);
  const settleTotal = owedBalances.reduce((s, b) => s + Math.abs(b.amount), 0);

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  // UPI deeplink — disabled until UPI settlement is re-enabled
  // const openUpi = (b: Balance) => {
  //   if (!b.upiId) return;
  //   const url = `upi://pay?pa=${b.upiId}&pn=${encodeURIComponent(b.name)}&am=${Math.abs(b.amount)}&cu=INR`;
  //   Linking.openURL(url).catch(() => {});
  // };

  const handlePayMember = (b: Balance) => {
    // openUpi(b); // UPI deeplink — disabled
    settleUp.mutate({ groupId: groupId, toUserId: b.userId, amount: Math.abs(b.amount) });
    showToast(`Settled with ${b.name} ✓`);
  };

  const handleSettleAll = () => {
    ctaScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 120 })
    );
    owedBalances.forEach(b => {
      settleUp.mutate({ groupId: groupId, toUserId: b.userId, amount: Math.abs(b.amount) });
    });
    // if (owedBalances.length > 0) openUpi(owedBalances[0]); // UPI deeplink — disabled
    showToast('All settlements recorded ✓');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.title}>Settle Up</Text>

        {/* Total Owe Card */}
        <View style={[styles.card, owedBalances.length > 0 ? styles.totalCard : styles.totalCardSettled]}>
          <Text style={styles.totalLabel}>TOTAL YOU OWE</Text>
          <Text style={[styles.totalAmount, owedBalances.length === 0 && styles.totalAmountSettled]}>
            ₹{settleTotal.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.totalSub}>
            {owedBalances.length === 0
              ? 'All settled up · ' + monthLabel
              : `to ${owedBalances.length} ${owedBalances.length === 1 ? 'person' : 'people'} · ${monthLabel}`}
          </Text>
        </View>

        {/* Settle All CTA */}
        {owedBalances.length > 0 && (
          <Animated.View style={[ctaStyle, styles.ctaWrap]}>
            <TouchableOpacity style={styles.ctaDanger} onPress={handleSettleAll} activeOpacity={0.9}>
              <Text style={styles.ctaText}>
                ⚡ Settle All · ₹{settleTotal.toLocaleString('en-IN')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Suggested */}
        {owedBalances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SUGGESTED</Text>
            <View style={[styles.card, { paddingVertical: 4 }]}>
              {owedBalances.map((b, i) => {
                const avColor = avatarColors[b.avatarColor];
                return (
                  <View key={b.userId}>
                    <View style={styles.settleRow}>
                      <View style={[styles.avatar, { backgroundColor: avColor.bg }]}>
                        <Text style={[styles.avatarText, { color: avColor.text }]}>
                          {initialsFromName(b.name)}
                        </Text>
                      </View>
                      <View style={styles.settleInfo}>
                        <Text style={styles.settleName}>You → {b.name}</Text>
                        {/* UPI ID sub-text — disabled until UPI settlement is re-enabled */}
                        {/* <Text style={styles.settleVpa}>{b.upiId ?? '—'}</Text> */}
                      </View>
                      <Text style={styles.settleAmount}>{formatAmount(b.amount)}</Text>
                      <TouchableOpacity
                        style={styles.upiBtn}
                        onPress={() => handlePayMember(b)}
                      >
                        <Text style={styles.upiBtnText}>Settle</Text>
                      </TouchableOpacity>
                    </View>
                    {i < owedBalances.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* All Balances */}
        {balances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ALL BALANCES</Text>
            <View style={[styles.card, { paddingVertical: 4 }]}>
              {balances.map((b, i) => {
                const avColor = avatarColors[b.avatarColor];
                const isOwes = b.amount < 0;
                return (
                  <View key={b.userId}>
                    <View style={styles.allBalRow}>
                      <View style={[styles.avatar, { backgroundColor: avColor.bg }]}>
                        <Text style={[styles.avatarText, { color: avColor.text }]}>
                          {initialsFromName(b.name)}
                        </Text>
                      </View>
                      <View style={styles.settleInfo}>
                        <Text style={styles.settleName}>{b.name}</Text>
                      </View>
                      <Text style={[styles.allBalAmount, isOwes ? styles.danger : styles.accent]}>
                        {isOwes ? '−' : '+'}₹{Math.abs(b.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                    {i < balances.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Empty state */}
        {balances.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All settled up!</Text>
            <Text style={styles.emptySub}>No outstanding balances with anyone.</Text>
          </View>
        )}
      </ScrollView>

      <ToastNotification message={toast} visible={toastVisible} />
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
  },
  totalCard: {
    backgroundColor: colors.dangerDim,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  totalCardSettled: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  totalLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 8,
  },
  totalAmount: {
    fontFamily: fonts.syne,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -2,
    color: colors.danger,
    marginBottom: 6,
  },
  totalAmountSettled: {
    color: colors.accent,
  },
  totalSub: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text2,
  },
  ctaWrap: {
    marginBottom: 20,
  },
  ctaDanger: {
    backgroundColor: colors.danger,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  section: {
    marginBottom: 16,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  allBalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '700',
  },
  settleInfo: {
    flex: 1,
  },
  settleName: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  settleVpa: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
    marginTop: 1,
  },
  settleAmount: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: colors.danger,
    marginRight: 10,
  },
  upiBtn: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 28,
    justifyContent: 'center',
  },
  upiBtnText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  allBalAmount: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
  },
  danger: { color: colors.danger },
  accent: { color: colors.accent },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
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
