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
import { useRouter } from 'expo-router';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { members, balances, categories } from '@/constants/sampleData';
import { formatAmount } from '@/constants/amountUtils';
import type { Expense } from '@/constants/sampleData';
import { useAppContext } from '@/context/AppContext';
import { QuickAddStrip } from '@/components/QuickAddStrip';
import { BalanceRow } from '@/components/BalanceCard';
import { ToastNotification } from '@/components/ToastNotification';

// ─── Mini avatar strip ────────────────────────────────────────────────────────

function MiniAvatars({ memberIds, maxShow = 3 }: { memberIds: string[]; maxShow?: number }) {
  const visible = memberIds.slice(0, maxShow);
  const overflow = memberIds.length - maxShow;
  return (
    <View style={miniStyles.row}>
      {visible.map((mid, i) => {
        const m = members.find(x => x.id === mid);
        if (!m) return null;
        return (
          <View
            key={mid}
            style={[
              miniStyles.dot,
              { backgroundColor: avatarColors[m.color].bg, marginLeft: i === 0 ? 0 : -5 },
            ]}
          >
            <Text style={[miniStyles.text, { color: avatarColors[m.color].text }]}>
              {m.initials}
            </Text>
          </View>
        );
      })}
      {overflow > 0 && (
        <View style={[miniStyles.dot, { backgroundColor: colors.cardElevated, marginLeft: -5 }]}>
          <Text style={[miniStyles.text, { color: colors.text2 }]}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const miniStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.card,
  },
  text: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 7,
    fontWeight: '700',
  },
});

// ─── Net balance logic ────────────────────────────────────────────────────────

type NetType = 'lent' | 'owed' | 'received' | 'personal';

function getNetBalance(exp: Expense): { type: NetType; amount: number } {
  if (exp.isIncome) return { type: 'received', amount: exp.amount };
  const split = exp.splitWith;
  if (!split || split.length <= 1) return { type: 'personal', amount: exp.amount };
  const perPerson = parseFloat((exp.amount / split.length).toFixed(2));
  if (exp.paidBy === 'aryan') return { type: 'lent', amount: exp.amount - perPerson };
  return { type: 'owed', amount: perPerson };
}

const NET_COLORS: Record<NetType, { main: string; dim: string }> = {
  lent:     { main: colors.accent, dim: 'rgba(0,212,154,0.55)'  },
  received: { main: colors.accent, dim: 'rgba(0,212,154,0.55)'  },
  owed:     { main: colors.danger, dim: 'rgba(255,89,89,0.55)'  },
  personal: { main: colors.text,   dim: colors.text3            },
};

const NET_LABELS: Record<NetType, string> = {
  lent:     'you lent',
  received: 'received',
  owed:     'you owe',
  personal: '',
};

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ exp, onPress }: { exp: Expense; onPress: () => void }) {
  const cat = exp.category ? categories.find(c => c.id === exp.category) : null;
  const net = getNetBalance(exp);
  const netColor = NET_COLORS[net.type];
  const isPersonal = net.type === 'personal';

  const payerMember = exp.paidBy ? members.find(m => m.id === exp.paidBy) : null;
  const payerLabel = exp.paidBy === 'aryan'
    ? 'You'
    : (payerMember?.name ?? '');

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.65}>
      <View style={rowStyles.row}>
        {/* Icon */}
        <View style={rowStyles.iconBox}>
          <Text style={{ fontSize: 18 }}>{exp.emoji}</Text>
        </View>

        {/* Info */}
        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={1}>{exp.title}</Text>

          {/* Line 2: date · category */}
          <View style={rowStyles.meta}>
            <Text style={rowStyles.date}>{exp.date}</Text>
            {cat && <Text style={rowStyles.catLabel}> · {cat.label}</Text>}
          </View>

          {/* Line 3: who paid · total · avatars (shared expenses only) */}
          {!isPersonal && exp.splitWith && exp.splitWith.length > 1 && (
            <View style={rowStyles.splitMeta}>
              <Text style={rowStyles.payerText} numberOfLines={1}>
                {payerLabel} paid {formatAmount(exp.amount)}
              </Text>
              <MiniAvatars memberIds={exp.splitWith} maxShow={3} />
            </View>
          )}
        </View>

        {/* Net balance — hero of the right column */}
        <View style={rowStyles.right}>
          <Text style={[rowStyles.netAmount, { color: netColor.main }]}>
            {net.type === 'owed' ? '−' : net.type !== 'personal' ? '+' : ''}
            {formatAmount(net.amount)}
          </Text>
          {NET_LABELS[net.type] !== '' && (
            <Text style={[rowStyles.netLabel, { color: netColor.dim }]}>
              {NET_LABELS[net.type]}
            </Text>
          )}
        </View>

        {/* Chevron */}
        <Text style={rowStyles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 3,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
  },
  catLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text3,
  },
  splitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  payerText: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text3,
    flexShrink: 1,
  },
  right: {
    alignItems: 'flex-end',
    flexShrink: 0,
    minWidth: 68,
  },
  netAmount: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  netLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 10,
    fontWeight: '400',
  },
  chevron: {
    fontSize: 18,
    color: colors.text3,
    flexShrink: 0,
    marginLeft: -4,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
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
            {isOwed ? '+' : '−'}{formatAmount(Math.abs(netAmt))}
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
                <ActivityRow
                  exp={exp}
                  onPress={() => router.push(`/expense/${exp.id}` as never)}
                />
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
    marginHorizontal: 14,
  },
});
