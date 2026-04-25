import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { members, balances, formatAmount } from '@/constants/sampleData';
import { useAppContext } from '@/context/AppContext';
import { QuickAddStrip } from '@/components/QuickAddStrip';
import { BalanceRow } from '@/components/BalanceCard';
import { ToastNotification } from '@/components/ToastNotification';

export default function HomeScreen() {
  const { expenses } = useAppContext();
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const handleQuickAdd = useCallback((amount: string) => {
    showToast(`✓ ₹${amount} added!`);
  }, [showToast]);

  const handlePay = useCallback((member: typeof members[0]) => {
    if (member.vpa) {
      const b = balances.find(b => b.memberId === member.id);
      const amt = b ? Math.abs(b.amount) : 0;
      const url = `upi://pay?pa=${member.vpa}&pn=${member.name}&am=${amt}&cu=INR`;
      Linking.openURL(url).catch(() => {});
    }
    showToast(`Opening GPay for ${member.name}…`);
  }, [showToast]);

  const netAmt = balances.reduce((s, b) => s + b.amount, 0);
  const isOwed = netAmt >= 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey Aryan 👋</Text>
            <Text style={styles.month}>April 2026</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: avatarColors.green.bg }]}>
            <Text style={[styles.avatarText, { color: avatarColors.green.text }]}>AR</Text>
          </View>
        </View>

        {/* Net Balance Card */}
        <View style={[styles.card, styles.balanceCard]}>
          <Text style={styles.sectionLabel}>NET BALANCE</Text>
          <Text style={[styles.balanceAmount, isOwed ? styles.accent : styles.danger]}>
            {isOwed ? '+' : '−'}₹{Math.abs(netAmt).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.balanceSub}>
            to 2 people · <Text style={{ color: 'rgba(255,89,89,0.6)' }}>3 pending</Text>
          </Text>
        </View>

        {/* Quick Add */}
        <View style={styles.section}>
          <QuickAddStrip onAdd={handleQuickAdd} />
        </View>

        {/* Balances */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BALANCES</Text>
          <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
            {balances.map((b, i) => {
              const member = members.find(m => m.id === b.memberId)!;
              return (
                <View key={b.memberId}>
                  <BalanceRow member={member} balance={b} onPay={handlePay} />
                  {i < balances.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
          <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
            {expenses.slice(0, 5).map((exp, i, arr) => (
              <View key={exp.id}>
                <View style={styles.expenseRow}>
                  <View style={styles.expenseIcon}>
                    <Text style={{ fontSize: 16 }}>{exp.emoji}</Text>
                  </View>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseTitle}>{exp.title}</Text>
                    <Text style={[styles.expenseSub, exp.isIncome && { color: colors.accent }]}>
                      {exp.people ? `${exp.people} · ` : ''}{exp.date}
                    </Text>
                  </View>
                  <Text style={styles.expenseAmount}>{formatAmount(exp.amount)}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
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
  balanceCard: {
    marginBottom: 16,
    backgroundColor: colors.dangerDim,
    borderColor: colors.dangerBorder,
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
  section: {
    marginBottom: 16,
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
