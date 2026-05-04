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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { useGroupDetail, useGroupMembers, useUpdateGroup, useAddGroupMember, useRemoveGroupMember, useArchiveGroup } from '@/hooks/useGroups';
import { useFriends } from '@/hooks/useFriends';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import { useBalances } from '@/hooks/useBalances';
import type { AvatarColor } from '@/types/database';
import { ToastNotification } from '@/components/ToastNotification';
import { formatAmount } from '@/constants/amountUtils';

const EMOJIS = ['🏠', '🏕️', '🍺', '✈️', '🎮', '👥'];

export default function EditGroupScreen() {
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: group } = useGroupDetail(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: friends = [] } = useFriends(currentUserId);
  const { data: balances = [] } = useBalances(groupId);

  const updateGroup = useUpdateGroup();
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const archiveGroup = useArchiveGroup();

  const [name, setName] = useState(group?.name ?? '');
  const [emoji, setEmoji] = useState(group?.cover_emoji ?? '🏠');

  // Sync initial values when group loads
  useState(() => {
    if (group) {
      setName(group.name);
      setEmoji(group.cover_emoji);
    }
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

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a group name.');
      return;
    }
    try {
      await updateGroup.mutateAsync({ groupId: groupId as string, name: name.trim(), cover_emoji: emoji });
      showToast('Group updated ✓');
      setTimeout(() => router.back(), 400);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not update group.');
    }
  }, [name, emoji, groupId, updateGroup, router, showToast]);

  const handleRemoveMember = useCallback((userId: string, memberName: string) => {
    const balance = balances.find(b => b.userId === userId);
    if (balance && Math.abs(balance.amount) >= 0.01) {
      Alert.alert(
        'Settle first',
        `Settle ${formatAmount(Math.abs(balance.amount))} with ${memberName} first.`,
      );
      return;
    }
    Alert.alert(
      'Remove member',
      `Remove ${memberName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember.mutateAsync({ groupId: groupId as string, userId });
              showToast(`${memberName} removed ✓`);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not remove member.');
            }
          },
        },
      ],
    );
  }, [groupId, removeMember, balances, showToast]);

  const handleAddMember = useCallback(async (userId: string) => {
    try {
      await addMember.mutateAsync({ groupId: groupId as string, userId });
      showToast('Member added ✓');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add member.');
    }
  }, [groupId, addMember, showToast]);

  const isPersonal = group?.group_type === 'personal';
  const memberIds = new Set(members.map(m => m.userId));
  const friendsNotInGroup = friends.filter(f => !memberIds.has(f.id));

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
        {/* Emoji */}
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

        {/* Name */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>GROUP NAME</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Flat, Goa Trip, Office…"
          placeholderTextColor={colors.text3}
          value={name}
          onChangeText={setName}
          maxLength={40}
        />

        {/* Members */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>MEMBERS</Text>
        <View style={[styles.card, { padding: 0, paddingVertical: 4, marginBottom: 12 }]}>
          {members.map((m, i) => {
            const av = avatarColors[m.avatarColor] ?? avatarColors.green;
            const isCurrentUser = m.userId === currentUserId;
            return (
              <View key={m.userId}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                    <Text style={[styles.avatarText, { color: av.text }]}>{m.initials}</Text>
                  </View>
                  <View style={styles.memberMeta}>
                    <Text style={styles.memberName}>{isCurrentUser ? 'You' : m.name}</Text>
                    <Text style={styles.memberRole}>{m.role}</Text>
                  </View>
                  {!isCurrentUser && !isPersonal && (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => handleRemoveMember(m.userId, m.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Add friends not in group — hidden for Personal group */}
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

        <TouchableOpacity
          style={[styles.ctaBtn, updateGroup.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={updateGroup.isPending}
        >
          {updateGroup.isPending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.ctaBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.archiveBtn}
          activeOpacity={0.7}
          onPress={() => Alert.alert(
            'Archive Group',
            'No new expenses can be added. History is kept.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Archive',
                style: 'destructive',
                onPress: async () => {
                  await archiveGroup.mutateAsync(groupId as string);
                  router.back();
                  router.back();
                },
              },
            ],
          )}
        >
          <Text style={styles.archiveBtnText}>Archive Group</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

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
    fontFamily: fonts.dmSansSemiBold, fontSize: 16, color: colors.text, marginBottom: 0,
  },

  card: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border, padding: 18,
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12 },
  memberMeta: { flex: 1 },
  memberName: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.text },
  memberRole: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginTop: 1 },
  removeBtn: {
    backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: 'rgba(255,89,89,0.18)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
  },
  removeBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.danger },
  addBtn: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
  },
  addBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent },

  ctaBtn: {
    backgroundColor: colors.accent, borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnText: { fontFamily: fonts.syne, fontSize: 15, color: '#000' },
  archiveBtn: {
    marginTop: 12, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,89,89,0.25)', backgroundColor: colors.dangerDim,
  },
  archiveBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, color: colors.danger },
});
