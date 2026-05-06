import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount, formatDisplayName } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import type { Balance } from '@/types/database';

interface BalanceRowProps {
  balance: Balance;
  onPay: (b: Balance) => void;
}

export function BalanceRow({ balance, onPay }: BalanceRowProps) {
  const avColor = avatarColors[balance.avatarColor] ?? avatarColors.green;
  const owes = balance.amount < 0;
  const amountStr = (owes ? '−' : '+') + formatAmount(Math.abs(balance.amount));

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: avColor.bg }]}>
        <Text style={[styles.avatarText, { color: avColor.text }]}>
          {initialsFromName(balance.name)}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{formatDisplayName(balance.name)}</Text>
        <Text style={styles.sub}>{owes ? 'You owe' : 'Owes you'}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, owes ? styles.danger : styles.accent]}>
          {amountStr}
        </Text>
        {owes && (
          <TouchableOpacity style={styles.payBtn} onPress={() => onPay(balance)}>
            <Text style={styles.payBtnText}>Settle</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
    marginTop: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  amount: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
  },
  danger: { color: colors.danger },
  accent: { color: colors.accent },
  payBtn: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 28,
    justifyContent: 'center',
  },
  payBtnText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
