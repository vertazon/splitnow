import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import {
  useGroupDetail,
  useGroupMembers,
  useUpdateGroup,
  useAddGroupMember,
  useArchiveGroup,
  useLeaveGroup,
  useRemoveMember,
  useUpdateMemberRole,
  useTransferAdminAndLeave,
} from '@/hooks/useGroups';
import { useFriends } from '@/hooks/useFriends';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { DEV_USER_ID } from '@/lib/auth';
import { useBalances } from '@/hooks/useBalances';
import type { AvatarColor } from '@/types/database';
import { ToastNotification } from '@/components/ToastNotification';
import { formatAmount } from '@/constants/amountUtils';
import type { GroupMemberWithUser } from '@/hooks/useGroups';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJIS = ['🏠', '🏕️', '🍺', '✈️', '🎮', '👥'];

const EMOJI_TYPE_MAP: Record<string, 'flat' | 'trip' | 'custom'> = {
  '🏠': 'flat',
  '✈️': 'trip',
};

function emojiToGroupType(e: string): 'flat' | 'trip' | 'custom' {
  return EMOJI_TYPE_MAP[e] ?? 'custom';
}

// Parse the UPPERCASE error code from a Supabase RPC RAISE EXCEPTION message
function rpcErrorCode(e: any): string {
  return (e?.message ?? '').split('\n')[0].trim();
}

// ─── Transfer Admin Sheet ─────────────────────────────────────────────────────

function TransferAdminSheet({
  visible,
  members,
  currentUserId,
  isPending,
  onSelect,
  onClose,
}: {
  visible: boolean;
  members: GroupMemberWithUser[];
  currentUserId: string;
  isPending: boolean;
  onSelect: (userId: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const others = members.filter(m => m.userId !== currentUserId);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.title}>Transfer Admin</Text>
        <Text style={sheetStyles.sub}>
          You're the only admin. Choose who takes over before you leave.
        </Text>

        {others.map(m => {
          const av = avatarColors[m.avatarColor] ?? avatarColors.green;
          return (
            <TouchableOpacity
              key={m.userId}
              style={sheetStyles.memberRow}
              onPress={() => onSelect(m.userId)}
              activeOpacity={0.7}
              disabled={isPending}
            >
              <View style={[sheetStyles.avatar, { backgroundColor: av.bg }]}>
                <Text style={[sheetStyles.avatarText, { color: av.text }]}>{m.initials}</Text>
              </View>
              <Text style={sheetStyles.memberName}>{m.name}</Text>
              {isPending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <View style={sheetStyles.promoteBtn}>
                  <Text style={sheetStyles.promoteBtnText}>Make admin & leave</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={sheetStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={sheetStyles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  title: {
    fontFamily: fonts.syne, fontSize: 18, color: colors.text,
    marginBottom: 6,
  },
  sub: {
    fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2,
    marginBottom: 20, lineHeight: 19,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12 },
  memberName: { flex: 1, fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text },
  promoteBtn: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  promoteBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent },
  cancelBtn: {
    marginTop: 16, height: 48, borderRadius: 14,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, color: colors.text2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EditGroupScreen() {
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const setCurrentGroupId = useGroupStore(s => s.setCurrentGroupId);

  const { data: group } = useGroupDetail(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: friends = [] } = useFriends(currentUserId);
  const { data: balances = [] } = useBalances(groupId);

  const updateGroup        = useUpdateGroup();
  const addMember          = useAddGroupMember();
  const archiveGroup       = useArchiveGroup();
  const leaveGroup         = useLeaveGroup();
  const removeMember       = useRemoveMember();
  const updateRole         = useUpdateMemberRole();
  const transferAndLeave   = useTransferAdminAndLeave();

  const [name, setName] = useState(group?.name ?? '');
  const [emoji, setEmoji] = useState(group?.cover_emoji ?? '🏠');
  const [showTransferSheet, setShowTransferSheet] = useState(false);

  useState(() => {
    if (group) { setName(group.name); setEmoji(group.cover_emoji); }
  });

  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const isPersonal = group?.group_type === 'personal';

  // Derived role state
  const currentMember = members.find(m => m.userId === currentUserId);
  const currentUserIsAdmin = currentMember?.role === 'admin';
  const activeAdminCount = members.filter(m => m.role === 'admin').length;
  const isSoleAdmin = currentUserIsAdmin && activeAdminCount === 1;

  const memberIds = new Set(members.map(m => m.userId));
  const friendsNotInGroup = friends.filter(f => !memberIds.has(f.id));

  // ── Save group details ──

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a group name.');
      return;
    }
    try {
      const group_type = group?.group_type === 'personal' ? 'personal' : emojiToGroupType(emoji);
      await updateGroup.mutateAsync({
        groupId: groupId as string, name: name.trim(), cover_emoji: emoji, group_type,
      });
      showToast('Group updated ✓');
      setTimeout(() => router.back(), 400);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not update group.');
    }
  }, [name, emoji, groupId, group, updateGroup, router, showToast]);

  // ── Leave group ──

  const handleLeave = useCallback(() => {
    if (isSoleAdmin && members.length > 1) {
      // Must transfer admin first
      setShowTransferSheet(true);
      return;
    }
    const msg = members.length <= 1
      ? "You're the last member. The group will be archived."
      : 'You will no longer see this group.';
    Alert.alert('Leave Group', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup.mutateAsync(groupId as string);
            setCurrentGroupId(null);
            router.back();
            router.back();
          } catch (e: any) {
            const code = rpcErrorCode(e);
            if (code === 'SOLE_ADMIN') {
              setShowTransferSheet(true);
            } else {
              Alert.alert('Error', e.message ?? 'Could not leave group.');
            }
          }
        },
      },
    ]);
  }, [isSoleAdmin, members, groupId, leaveGroup, setCurrentGroupId, router]);

  const handleTransferAndLeave = useCallback(async (newAdminId: string) => {
    try {
      await transferAndLeave.mutateAsync({ groupId: groupId as string, newAdminId });
      setShowTransferSheet(false);
      setCurrentGroupId(null);
      router.back();
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not transfer admin.');
    }
  }, [groupId, transferAndLeave, setCurrentGroupId, router]);

  // ── Remove member ──

  const handleRemove = useCallback((member: GroupMemberWithUser) => {
    const balance = balances.find(b => b.userId === member.userId);
    const hasBalance = balance && Math.abs(balance.amount) >= 0.01;

    const doRemove = async () => {
      try {
        await removeMember.mutateAsync({ groupId: groupId as string, userId: member.userId });
        showToast(`${member.name} removed ✓`);
      } catch (e: any) {
        const code = rpcErrorCode(e);
        if (code === 'LAST_ADMIN') {
          Alert.alert('Cannot remove', 'This member is the last admin. Promote someone else first.');
        } else if (code === 'NOT_ADMIN') {
          Alert.alert('Not allowed', 'Only admins can remove members.');
        } else {
          Alert.alert('Error', e.message ?? 'Could not remove member.');
        }
      }
    };

    if (hasBalance) {
      Alert.alert(
        `Remove ${member.name}?`,
        `They have an unsettled balance of ${formatAmount(Math.abs(balance!.amount))}. They'll still appear in existing expenses.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove anyway', style: 'destructive', onPress: doRemove },
        ],
      );
    } else {
      Alert.alert(
        `Remove ${member.name}?`,
        'They will lose access to this group. Their past expenses stay.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ],
      );
    }
  }, [groupId, balances, removeMember, showToast]);

  // ── Promote / demote ──

  const handleRoleToggle = useCallback((member: GroupMemberWithUser) => {
    const isPromote = member.role === 'member';
    const action = isPromote ? 'Make admin' : 'Remove admin';
    const detail = isPromote
      ? `${member.name} will be able to remove members and manage roles.`
      : `${member.name} will become a regular member.`;

    Alert.alert(action, detail, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        onPress: async () => {
          try {
            await updateRole.mutateAsync({
              groupId: groupId as string,
              userId: member.userId,
              role: isPromote ? 'admin' : 'member',
            });
            showToast(isPromote ? `${member.name} is now admin ✓` : `${member.name} demoted ✓`);
          } catch (e: any) {
            const code = rpcErrorCode(e);
            if (code === 'LAST_ADMIN') {
              Alert.alert('Cannot demote', 'At least one admin must remain.');
            } else {
              Alert.alert('Error', e.message ?? 'Could not update role.');
            }
          }
        },
      },
    ]);
  }, [groupId, updateRole, showToast]);

  // ── Add friend ──

  const handleAddMember = useCallback(async (userId: string) => {
    try {
      await addMember.mutateAsync({ groupId: groupId as string, userId });
      showToast('Member added ✓');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add member.');
    }
  }, [groupId, addMember, showToast]);

  // ── Archive ──

  const handleArchive = useCallback(() => {
    Alert.alert(
      'Archive Group',
      'No new expenses can be added. All history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await archiveGroup.mutateAsync(groupId as string);
            setCurrentGroupId(null);
            router.back();
            router.back();
          },
        },
      ],
    );
  }, [groupId, archiveGroup, setCurrentGroupId, router]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Group</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Group icon ── */}
        {!isPersonal && (
          <>
            <Text style={styles.sectionLabel}>GROUP ICON</Text>
            <View style={styles.emojiRow}>
              {EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiBtn, emoji === e && styles.emojiBtnSelected]}
                  onPress={() => setEmoji(e)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.emojiBtnText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Group name ── */}
        <Text style={[styles.sectionLabel, { marginTop: isPersonal ? 0 : 20 }]}>GROUP NAME</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Flat, Goa Trip, Office…"
          placeholderTextColor={colors.text3}
          value={name}
          onChangeText={setName}
          maxLength={40}
        />

        {/* ── Members ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
          MEMBERS · {members.length}
        </Text>
        <View style={[styles.card, { padding: 0, paddingVertical: 4, marginBottom: 12 }]}>
          {members.map((m, i) => {
            const av = avatarColors[m.avatarColor] ?? avatarColors.green;
            const isCurrentUser = m.userId === currentUserId;
            const isAdmin = m.role === 'admin';
            const canActOnMember = currentUserIsAdmin && !isCurrentUser && !isPersonal;
            const canDemote = isAdmin && activeAdminCount > 1;

            return (
              <View key={m.userId}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.memberRow}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                    <Text style={[styles.avatarText, { color: av.text }]}>{m.initials}</Text>
                  </View>

                  {/* Name + role badge */}
                  <View style={styles.memberMeta}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {isCurrentUser ? 'You' : m.name}
                      </Text>
                      {isAdmin && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>ADMIN</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberSub}>{m.name}</Text>
                  </View>

                  {/* Admin actions */}
                  {canActOnMember && (
                    <View style={styles.memberActions}>
                      {/* Promote / Demote */}
                      <TouchableOpacity
                        style={[
                          styles.roleBtn,
                          isAdmin ? styles.roleBtnDemote : styles.roleBtnPromote,
                          (!canDemote && isAdmin) && styles.roleBtnDisabled,
                        ]}
                        onPress={() => handleRoleToggle(m)}
                        activeOpacity={0.7}
                        disabled={updateRole.isPending || (!canDemote && isAdmin)}
                      >
                        <Text style={[
                          styles.roleBtnText,
                          isAdmin ? styles.roleBtnTextDemote : styles.roleBtnTextPromote,
                          (!canDemote && isAdmin) && styles.roleBtnTextDisabled,
                        ]}>
                          {isAdmin ? 'Demote' : '+ Admin'}
                        </Text>
                      </TouchableOpacity>

                      {/* Remove */}
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => handleRemove(m)}
                        activeOpacity={0.7}
                        disabled={removeMember.isPending}
                      >
                        <Ionicons name="remove-circle-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Add friends ── */}
        {!isPersonal && friendsNotInGroup.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>ADD MEMBERS</Text>
            <View style={[styles.card, { padding: 0, paddingVertical: 4, marginBottom: 12 }]}>
              {friendsNotInGroup.map((f, i) => {
                const av = avatarColors[(f.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
                const parts = (f.name ?? '').split(' ');
                const initials = parts.length >= 2
                  ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
                  : (f.name ?? '??').slice(0, 2).toUpperCase();
                return (
                  <View key={f.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.memberRow}>
                      <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                        <Text style={[styles.avatarText, { color: av.text }]}>{initials}</Text>
                      </View>
                      <View style={styles.memberMeta}>
                        <Text style={styles.memberName}>{f.name}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => handleAddMember(f.id)}
                        activeOpacity={0.7}
                        disabled={addMember.isPending}
                      >
                        <Text style={styles.addBtnText}>+ Add</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Save ── */}
        <TouchableOpacity
          style={[styles.ctaBtn, updateGroup.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={updateGroup.isPending}
        >
          {updateGroup.isPending
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.ctaBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        {/* ── Leave group ── */}
        {!isPersonal && (
          <TouchableOpacity
            style={styles.leaveBtn}
            activeOpacity={0.7}
            onPress={handleLeave}
            disabled={leaveGroup.isPending || transferAndLeave.isPending}
          >
            {leaveGroup.isPending || transferAndLeave.isPending
              ? <ActivityIndicator color={colors.danger} size="small" />
              : <Text style={styles.leaveBtnText}>Leave Group</Text>}
          </TouchableOpacity>
        )}

        {/* ── Archive (admins only) ── */}
        {currentUserIsAdmin && !isPersonal && (
          <TouchableOpacity
            style={styles.archiveBtn}
            activeOpacity={0.7}
            onPress={handleArchive}
          >
            <Text style={styles.archiveBtnText}>Archive Group</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Transfer admin sheet */}
      <TransferAdminSheet
        visible={showTransferSheet}
        members={members}
        currentUserId={currentUserId}
        isPending={transferAndLeave.isPending}
        onSelect={handleTransferAndLeave}
        onClose={() => setShowTransferSheet(false)}
      />

      <ToastNotification message={toast} visible={toastVisible} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: fonts.syne, fontSize: 17, color: colors.text,
  },
  headerSpacer: { width: 36 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 20 },

  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text2,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },

  emojiRow: { flexDirection: 'row', gap: 8 },
  emojiBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.cardElevated, borderWidth: 1.5, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnSelected: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  emojiBtnText: { fontSize: 22 },

  nameInput: {
    backgroundColor: colors.cardElevated, borderWidth: 1.5, borderColor: colors.borderEmphasis,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.dmSansSemiBold, fontSize: 16, color: colors.text,
  },

  card: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border, padding: 18,
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11, gap: 10,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12 },
  memberMeta: { flex: 1, minWidth: 0 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text, flexShrink: 1 },
  memberSub: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginTop: 2 },

  adminBadge: {
    backgroundColor: 'rgba(0,212,154,0.10)', borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0,
  },
  adminBadgeText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 9, color: colors.accent, letterSpacing: 0.5,
  },

  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },

  roleBtn: {
    borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, minHeight: 28, justifyContent: 'center',
  },
  roleBtnPromote: { backgroundColor: 'rgba(91,159,255,0.10)', borderColor: 'rgba(91,159,255,0.25)' },
  roleBtnDemote:  { backgroundColor: colors.cardElevated, borderColor: colors.borderEmphasis },
  roleBtnDisabled: { opacity: 0.35 },
  roleBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11 },
  roleBtnTextPromote: { color: colors.blue },
  roleBtnTextDemote:  { color: colors.text2 },
  roleBtnTextDisabled: { color: colors.text3 },

  removeBtn: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: 'rgba(255,89,89,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  addBtn: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
  },
  addBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent },

  ctaBtn: {
    backgroundColor: colors.accent, borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  ctaBtnText: { fontFamily: fonts.syne, fontSize: 15, color: '#000' },

  leaveBtn: {
    marginTop: 12, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,89,89,0.25)',
    backgroundColor: colors.dangerDim,
  },
  leaveBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, color: colors.danger },

  archiveBtn: {
    marginTop: 10, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderEmphasis,
  },
  archiveBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text3 },
});
