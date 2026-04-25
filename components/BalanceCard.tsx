import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import type { Balance, Member } from '@/constants/sampleData';
import { formatAmount } from '@/constants/sampleData';

interface BalanceRowProps {
  member: Member;
  balance: Balance;
  onPay: (member: Member) => void;
}

export function BalanceRow({ member, balance, onPay }: BalanceRowProps) {
  const avColor = avatarColors[member.color];
  const owes = balance.amount < 0;
  const amountStr = (owes ? '−' : '+') + formatAmount(balance.amount);

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: avColor.bg }]}>
        <Text style={[styles.avatarText, { color: avColor.text }]}>{member.initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{member.name}</Text>
        <Text style={styles.sub}>{owes ? 'You owe' : 'Owes you'}</Text>
      </View>
      <Text style={[styles.amount, owes ? styles.danger : styles.accent]}>
        {amountStr}
      </Text>
      {owes ? (
        <TouchableOpacity style={styles.payBtn} onPress={() => onPay(member)}>
          <Text style={styles.payBtnText}>Pay UPI</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.payPlaceholder} />
      )}
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
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
    marginTop: 1,
  },
  amount: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
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
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  payPlaceholder: {
    width: 60,
  },
});
