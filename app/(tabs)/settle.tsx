import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Linking,
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
import { members, balances } from '@/constants/sampleData';
import { formatAmount } from '@/constants/amountUtils';
import { ToastNotification } from '@/components/ToastNotification';

const owedBalances = balances.filter(b => b.amount < 0);
const allBalances = balances;
const settleTotal = owedBalances.reduce((s, b) => s + Math.abs(b.amount), 0);

export default function SettleScreen() {
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const handleSettleAll = () => {
    ctaScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 120 })
    );
    showToast('Opening UPI for all settlements…');
  };

  const handlePayMember = (memberId: string) => {
    const m = members.find(x => x.id === memberId)!;
    const b = balances.find(x => x.memberId === memberId)!;
    if (m.vpa) {
      const url = `upi://pay?pa=${m.vpa}&pn=${m.name}&am=${Math.abs(b.amount)}&cu=INR`;
      Linking.openURL(url).catch(() => {});
    }
    showToast(`Opening GPay for ${m.name}…`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settle Up</Text>

        {/* Total Owe Card */}
        <View style={[styles.card, styles.totalCard]}>
          <Text style={styles.totalLabel}>TOTAL YOU OWE</Text>
          <Text style={styles.totalAmount}>₹{settleTotal.toLocaleString('en-IN')}</Text>
          <Text style={styles.totalSub}>to 2 people · Apr 2026</Text>
        </View>

        {/* Settle All CTA */}
        <Animated.View style={[ctaStyle, styles.ctaWrap]}>
          <TouchableOpacity style={styles.ctaDanger} onPress={handleSettleAll} activeOpacity={0.9}>
            <Text style={styles.ctaText}>
              ⚡ Settle All · Pay ₹{settleTotal.toLocaleString('en-IN')}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Suggested */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUGGESTED</Text>
          <View style={[styles.card, { paddingVertical: 4 }]}>
            {owedBalances.map((b, i) => {
              const m = members.find(x => x.id === b.memberId)!;
              const avColor = avatarColors[m.color];
              return (
                <View key={b.memberId}>
                  <View style={styles.settleRow}>
                    <View style={[styles.avatar, { backgroundColor: avColor.bg }]}>
                      <Text style={[styles.avatarText, { color: avColor.text }]}>{m.initials}</Text>
                    </View>
                    <View style={styles.settleInfo}>
                      <Text style={styles.settleName}>You → {m.name}</Text>
                      <Text style={styles.settleVpa}>{m.vpa ?? '—'}</Text>
                    </View>
                    <Text style={styles.settleAmount}>
                      {formatAmount(b.amount)}
                    </Text>
                    <TouchableOpacity
                      style={styles.upiBtn}
                      onPress={() => handlePayMember(b.memberId)}
                    >
                      <Text style={styles.upiBtnText}>UPI →</Text>
                    </TouchableOpacity>
                  </View>
                  {i < owedBalances.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* All Balances */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ALL BALANCES</Text>
          <View style={[styles.card, { paddingVertical: 4 }]}>
            {allBalances.map((b, i) => {
              const m = members.find(x => x.id === b.memberId)!;
              const avColor = avatarColors[m.color];
              const isOwes = b.amount < 0;
              return (
                <View key={b.memberId}>
                  <View style={styles.allBalRow}>
                    <View style={[styles.avatar, { backgroundColor: avColor.bg }]}>
                      <Text style={[styles.avatarText, { color: avColor.text }]}>{m.initials}</Text>
                    </View>
                    <View style={styles.settleInfo}>
                      <Text style={styles.settleName}>{m.name}</Text>
                    </View>
                    <Text style={[styles.allBalAmount, isOwes ? styles.danger : styles.accent]}>
                      {isOwes ? '−' : '+'}₹{Math.abs(b.amount).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {i < allBalances.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        </View>
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
});
