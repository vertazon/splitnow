import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';
import { formatAmount, formatDisplayName } from '@/constants/amountUtils';
import { formatActivityDate, initialsFromName } from '@/constants/dateFormat';
import type { AvatarColor } from '@/types/database';
import type { ExpenseWithSplits } from '@/hooks/useExpenses';
import type { Settlement } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemberLite { id: string; name: string; color: AvatarColor; }

export type NetType = 'lent' | 'owed' | 'personal' | 'uninvolved';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getNetBalance(
  exp: ExpenseWithSplits,
  userId: string,
): { type: NetType; amount: number } {
  const splits = exp.splits ?? [];
  const otherSplits = splits.filter(s => s.user_id !== userId);
  const myShare = splits.find(s => s.user_id === userId)?.amount_owed ?? 0;

  if (otherSplits.length === 0) return { type: 'personal', amount: exp.amount };

  if (exp.paid_by === userId) {
    const lent = otherSplits.reduce((sum, s) => sum + s.amount_owed, 0);
    return { type: 'lent', amount: parseFloat(lent.toFixed(2)) };
  }

  if (myShare === 0) return { type: 'uninvolved', amount: 0 };

  return { type: 'owed', amount: parseFloat(myShare.toFixed(2)) };
}

export const NET_COLORS: Record<NetType, { main: string; dim: string }> = {
  lent:       { main: colors.accent, dim: 'rgba(0,212,154,0.80)' },
  owed:       { main: colors.danger, dim: 'rgba(255,89,89,0.80)' },
  personal:   { main: colors.text,   dim: colors.text2           },
  uninvolved: { main: colors.text3,  dim: colors.text3           },
};

const NET_LABELS: Record<NetType, string> = {
  lent:       'you lent',
  owed:       'you owe',
  personal:   '',
  uninvolved: 'not involved',
};

// ─── MiniAvatars ─────────────────────────────────────────────────────────────

export function MiniAvatars({
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
    fontSize: 9,
    fontWeight: '700',
  },
});

// ─── ActivityRow ─────────────────────────────────────────────────────────────

export function ActivityRow({
  exp,
  memberMap,
  currentUserId,
  onPress,
  groupBadge,
}: {
  exp: ExpenseWithSplits;
  memberMap: Map<string, MemberLite>;
  currentUserId: string;
  onPress: () => void;
  groupBadge?: string;
}) {
  const cat = categories.find(c => c.id === exp.category);
  const emoji = cat?.emoji ?? '📦';
  const net = getNetBalance(exp, currentUserId);
  const netColor = NET_COLORS[net.type];
  const isPersonal = net.type === 'personal';

  const payerLabel = exp.paid_by === currentUserId
    ? 'You'
    : formatDisplayName(memberMap.get(exp.paid_by ?? '')?.name);

  const splitUserIds = (exp.splits ?? []).map(s => s.user_id);
  const dateStr = formatActivityDate(exp.created_at);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.65}>
      <View style={rowStyles.row}>
        <View style={rowStyles.iconBox}>
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
        </View>

        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={1}>{exp.title}</Text>

          <View style={rowStyles.meta}>
            <Text style={rowStyles.date}>{dateStr}</Text>
            {cat && !groupBadge && <Text style={rowStyles.catLabel}> · {cat.label}</Text>}
            {groupBadge && (
              <View style={rowStyles.groupBadge}>
                <Text style={rowStyles.groupBadgeText}>{groupBadge}</Text>
              </View>
            )}
          </View>

          {!isPersonal && splitUserIds.length > 0 && (
            <View style={rowStyles.splitMeta}>
              <Text style={rowStyles.payerText} numberOfLines={1}>
                {payerLabel} paid {formatAmount(exp.amount)}
              </Text>
              <MiniAvatars userIds={splitUserIds} memberMap={memberMap} maxShow={3} />
            </View>
          )}
        </View>

        <View style={rowStyles.right}>
          <Text style={[rowStyles.netAmount, { color: netColor.main }]}>
            {net.type === 'uninvolved' ? '—' : (net.type === 'owed' ? '−' : net.type === 'lent' ? '+' : '') + formatAmount(net.amount)}
          </Text>
          {NET_LABELS[net.type] !== '' && (
            <Text style={[rowStyles.netLabel, { color: netColor.dim }]}>
              {NET_LABELS[net.type]}
            </Text>
          )}
        </View>

        <Text style={rowStyles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── SettlementRow ────────────────────────────────────────────────────────────

export function SettlementRow({
  settlement,
  memberMap,
  currentUserId,
  onPress,
}: {
  settlement: Settlement;
  memberMap: Map<string, MemberLite>;
  currentUserId: string;
  onPress?: () => void;
}) {
  const isSender = settlement.from_user === currentUserId;
  const isReceiver = settlement.to_user === currentUserId;

  const fromMember = memberMap.get(settlement.from_user ?? '');
  const toMember   = memberMap.get(settlement.to_user ?? '');

  const fromLabel = isSender ? 'You' : formatDisplayName(fromMember?.name);
  const toLabel   = isReceiver ? 'you' : formatDisplayName(toMember?.name);

  const title = isSender
    ? `You paid ${toLabel}`
    : `${fromLabel} paid ${isReceiver ? 'you' : toLabel}`;

  const dateStr = formatActivityDate(settlement.settled_at);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.65 : 1} disabled={!onPress}>
      <View style={rowStyles.row}>
        {/* Static settlement icon */}
        <View style={[rowStyles.iconBox, settlementStyles.iconBg]}>
          <Ionicons name="checkmark-done" size={18} color={colors.accent} />
        </View>

        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={1}>{title}</Text>
          <View style={rowStyles.meta}>
            <Text style={rowStyles.date}>{dateStr}</Text>
            <Text style={rowStyles.catLabel}> · settlement</Text>
          </View>
        </View>

        <View style={rowStyles.right}>
          <Text style={[rowStyles.netAmount, { color: colors.accent }]}>
            {formatAmount(settlement.amount)}
          </Text>
          <Text style={[rowStyles.netLabel, { color: 'rgba(0,212,154,0.80)' }]}>
            {isSender ? 'you paid' : 'received'}
          </Text>
        </View>

        {onPress && <Text style={rowStyles.chevron}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

const settlementStyles = StyleSheet.create({
  iconBg: { backgroundColor: 'rgba(0,212,154,0.15)', borderWidth: 1, borderColor: colors.accentMid },
});

export const rowStyles = StyleSheet.create({
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
  date: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2 },
  catLabel: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2 },
  splitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  payerText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    flexShrink: 1,
  },
  right: { alignItems: 'flex-end', flexShrink: 0, minWidth: 68 },
  netAmount: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  netLabel: { fontFamily: fonts.dmSans, fontSize: 12, fontWeight: '600' },
  chevron: { fontSize: 18, color: colors.text2, flexShrink: 0, marginLeft: -4 },
  groupBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 5,
  },
  groupBadgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text2 },
});
