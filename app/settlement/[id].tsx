import { formatAmount } from '@/constants/amountUtils';
import { avatarColors, colors } from '@/constants/colors';
import { initialsFromName } from '@/constants/dateFormat';
import { fonts } from '@/constants/typography';
import { useGroupMembers } from '@/hooks/useGroups';
import { useSettlement, useDeleteSettlement } from '@/hooks/useSettlements';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor } from '@/types/database';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatSettledAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function SettlementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: settlement, isLoading } = useSettlement(id);
  const { data: members = [] } = useGroupMembers(settlement?.group_id ?? null);
  const deleteSettlement = useDeleteSettlement();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const memberMap = new Map(members.map(m => [m.userId, m]));

  const handleDelete = () => {
    if (!settlement) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    deleteSettlement.mutate(
      { id: settlement.id, groupId: settlement.group_id },
      { onSuccess: () => router.back() }
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settlement</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!settlement) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settlement</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>Settlement not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isSender = settlement.from_user === currentUserId;

  const fromMember = memberMap.get(settlement.from_user ?? '');
  const toMember   = memberMap.get(settlement.to_user ?? '');
  const fromAv = avatarColors[(fromMember?.avatarColor ?? 'green') as AvatarColor] ?? avatarColors.green;
  const toAv   = avatarColors[(toMember?.avatarColor ?? 'green') as AvatarColor] ?? avatarColors.green;

  const fromName = isSender ? 'You' : (fromMember?.name ?? '—');
  const toName   = settlement.to_user === currentUserId ? 'You' : (toMember?.name ?? '—');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settlement</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/settlement/edit/${settlement!.id}` as never)}
          >
            <Ionicons name="pencil-outline" size={13} color={colors.text2} />
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, deleteConfirm ? styles.actionBtnDanger : styles.actionBtnDelete]}
            onPress={handleDelete}
            disabled={deleteSettlement.isPending}
          >
            <Ionicons
              name={deleteConfirm ? 'warning-outline' : 'trash-outline'}
              size={13}
              color={colors.danger}
            />
            <Text style={[styles.actionBtnText, styles.actionBtnTextDelete]}>
              {deleteConfirm ? 'Confirm?' : 'Delete'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {/* Hero receipt card — avatars + amount merged */}
        <View style={styles.heroCard}>
          {/* Status pill */}
          <View style={styles.statusPill}>
            <Ionicons name="checkmark-done" size={12} color={colors.accent} />
            <Text style={styles.statusPillText}>Settlement recorded</Text>
          </View>

          {/* Avatars + arrow + names */}
          <View style={styles.transferSection}>
            {/* Avatar row — arrow aligned to avatar center line */}
            <View style={styles.avatarRow}>
              <View style={styles.transferSlot}>
                <View style={[styles.transferAvatar, { backgroundColor: fromAv.bg }]}>
                  <Text style={[styles.transferAvatarText, { color: fromAv.text }]}>
                    {initialsFromName(fromName)}
                  </Text>
                </View>
              </View>
              <View style={styles.arrowWrap}>
                <Ionicons name="arrow-forward" size={16} color={colors.text3} />
              </View>
              <View style={styles.transferSlot}>
                <View style={[styles.transferAvatar, { backgroundColor: toAv.bg }]}>
                  <Text style={[styles.transferAvatarText, { color: toAv.text }]}>
                    {initialsFromName(toName)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Name row — aligned under respective avatars */}
            <View style={styles.nameRow}>
              <Text style={styles.transferName}>{fromName}</Text>
              <View style={styles.nameRowSpacer} />
              <Text style={styles.transferName}>{toName}</Text>
            </View>
          </View>

          {/* Amount */}
          <View style={styles.amountWrap}>
            <Text style={styles.amountValue}>{formatAmount(settlement.amount)}</Text>
            <Text style={styles.amountSub}>
              {isSender ? `paid to ${toName}` : `received from ${fromName}`}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date & time</Text>
            <Text style={styles.detailValue}>{formatSettledAt(settlement.settled_at)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Completed</Text>
            </View>
          </View>
          {settlement.upi_ref && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>UPI ref</Text>
                <Text style={styles.detailValue}>{settlement.upi_ref}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontFamily: fonts.syne, fontSize: 15, color: colors.text2 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.syne, fontSize: 17, fontWeight: '800', color: colors.text,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    backgroundColor: colors.cardElevated,
  },
  actionBtnDelete: {
    borderColor: 'rgba(255,89,89,0.25)',
    backgroundColor: 'rgba(255,89,89,0.08)',
  },
  actionBtnDanger: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerDim,
  },
  actionBtnText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 12,
    fontWeight: '600', color: colors.text2,
  },
  actionBtnTextDelete: { color: colors.danger },

  content: { padding: 22, gap: 12 },

  // Hero receipt card
  heroCard: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 22, padding: 24, alignItems: 'center', gap: 24,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  statusPillText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent },
  transferSection: { alignSelf: 'stretch', gap: 10 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  transferSlot: { flex: 1, alignItems: 'center' },
  transferAvatar: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },
  transferAvatarText: { fontFamily: fonts.syne, fontSize: 20, fontWeight: '800' },
  arrowWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameRowSpacer: { width: 32 },
  transferName: { flex: 1, textAlign: 'center', fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text },
  amountWrap: { alignItems: 'center', gap: 4 },
  amountValue: {
    fontFamily: fonts.syne, fontSize: 40, fontWeight: '800',
    letterSpacing: -2, color: colors.accent,
  },
  amountSub: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2 },

  // Details card
  detailsCard: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 22, overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  detailDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 18 },
  detailLabel: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2 },
  detailValue: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text, flex: 1, textAlign: 'right' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  statusText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.accent },
});
