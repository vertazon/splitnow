import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';
import { formatAmount } from '@/constants/amountUtils';
import { formatActivityDate, initialsFromName } from '@/constants/dateFormat';
import type { Balance, AvatarColor } from '@/types/database';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useExpenses, type ExpenseWithSplits } from '@/hooks/useExpenses';
import { useBalances } from '@/hooks/useBalances';
import { useMembers } from '@/hooks/useMembers';
import { BalanceRow } from '@/components/BalanceCard';
import { ToastNotification } from '@/components/ToastNotification';

// ─── Mini avatar strip ────────────────────────────────────────────────────────

interface MemberLite { id: string; name: string; color: AvatarColor; }

function MiniAvatars({
  userIds,
  memberMap,
  maxShow = 3,
}: {
  userIds: string[];
  memberMap: Map<string, MemberLite>;
  maxShow?: number;
}) {
  const visible = userIds.slice(0, maxShow);
  const overflow = userIds.length - maxShow;
  return (
    <View style={miniStyles.row}>
      {visible.map((uid, i) => {
        const m = memberMap.get(uid);
        if (!m) return null;
        const av = avatarColors[m.color] ?? avatarColors.green;
        return (
          <View
            key={uid}
            style={[
              miniStyles.dot,
              { backgroundColor: av.bg, marginLeft: i === 0 ? 0 : -5 },
            ]}
          >
            <Text style={[miniStyles.text, { color: av.text }]}>
              {initialsFromName(m.name)}
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

type NetType = 'lent' | 'owed' | 'personal';

function getNetBalance(exp: ExpenseWithSplits, userId: string): { type: NetType; amount: number } {
  const splits = exp.splits ?? [];
  const otherSplits = splits.filter(s => s.user_id !== userId);
  const myShare = splits.find(s => s.user_id === userId)?.amount_owed ?? 0;

  if (otherSplits.length === 0) return { type: 'personal', amount: exp.amount };

  if (exp.paid_by === userId) {
    // I paid; others owe me their shares
    const lent = otherSplits.reduce((sum, s) => sum + s.amount_owed, 0);
    return { type: 'lent', amount: parseFloat(lent.toFixed(2)) };
  }

  // Someone else paid; I owe my share
  return { type: 'owed', amount: parseFloat(myShare.toFixed(2)) };
}

const NET_COLORS: Record<NetType, { main: string; dim: string }> = {
  lent:     { main: colors.accent, dim: 'rgba(0,212,154,0.55)' },
  owed:     { main: colors.danger, dim: 'rgba(255,89,89,0.55)' },
  personal: { main: colors.text,   dim: colors.text3           },
};

const NET_LABELS: Record<NetType, string> = {
  lent: 'you lent',
  owed: 'you owe',
  personal: '',
};

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({
  exp,
  memberMap,
  currentUserId,
  onPress,
}: {
  exp: ExpenseWithSplits;
  memberMap: Map<string, MemberLite>;
  currentUserId: string;
  onPress: () => void;
}) {
  const cat = categories.find(c => c.id === exp.category);
  const emoji = cat?.emoji ?? '📦';
  const net = getNetBalance(exp, currentUserId);
  const netColor = NET_COLORS[net.type];
  const isPersonal = net.type === 'personal';

  const payerLabel = exp.paid_by === currentUserId
    ? 'You'
    : memberMap.get(exp.paid_by ?? '')?.name ?? '';

  const splitUserIds = (exp.splits ?? []).map(s => s.user_id);
  const dateStr = formatActivityDate(exp.created_at);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.65}>
      <View style={rowStyles.row}>
        {/* Icon */}
        <View style={rowStyles.iconBox}>
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
        </View>

        {/* Info */}
        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={1}>{exp.title}</Text>

          {/* Line 2: date · category */}
          <View style={rowStyles.meta}>
            <Text style={rowStyles.date}>{dateStr}</Text>
            {cat && <Text style={rowStyles.catLabel}> · {cat.label}</Text>}
          </View>

          {/* Line 3: who paid · total · avatars (shared expenses only) */}
          {!isPersonal && splitUserIds.length > 1 && (
            <View style={rowStyles.splitMeta}>
              <Text style={rowStyles.payerText} numberOfLines={1}>
                {payerLabel} paid {formatAmount(exp.amount)}
              </Text>
              <MiniAvatars userIds={splitUserIds} memberMap={memberMap} maxShow={3} />
            </View>
          )}
        </View>

        {/* Net balance */}
        <View style={rowStyles.right}>
          <Text style={[rowStyles.netAmount, { color: netColor.main }]}>
            {net.type === 'owed' ? '−' : net.type === 'lent' ? '+' : ''}
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
  info: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 3,
  },
  meta: { flexDirection: 'row', alignItems: 'center' },
  date: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2 },
  catLabel: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3 },
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
  right: { alignItems: 'flex-end', flexShrink: 0, minWidth: 68 },
  netAmount: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  netLabel: { fontFamily: fonts.dmSans, fontSize: 10, fontWeight: '400' },
  chevron: { fontSize: 18, color: colors.text3, flexShrink: 0, marginLeft: -4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: expenses = [], isLoading: expLoading, error: expError } = useExpenses(groupId);
  const { data: balances = [], isLoading: balLoading } = useBalances(groupId);
  const { data: members = [] } = useMembers(groupId);

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
    if (b.upiId) {
      const amt = Math.abs(b.amount);
      const url = `upi://pay?pa=${b.upiId}&pn=${b.name}&am=${amt}&cu=INR`;
      Linking.openURL(url).catch(() => {});
    }
    showToast(`Opening GPay for ${b.name}…`);
  }, [showToast]);

  // Map for fast lookup inside ActivityRow + MiniAvatars
  const memberMap = new Map<string, MemberLite>(
    members.map(m => [m.id, { id: m.id, name: m.name, color: (m.avatar_color ?? 'green') as AvatarColor }])
  );

  const netAmt = balances.reduce((s, b) => s + b.amount, 0);
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
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey {firstName} 👋</Text>
            <Text style={styles.month}>
              {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: av.bg }]}>
            <Text style={[styles.avatarText, { color: av.text }]}>{userInitials}</Text>
          </View>
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
          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
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
