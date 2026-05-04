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
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import { useCreateGroup } from '@/hooks/useGroups';
import { avatarColors } from '@/constants/colors';
import type { AvatarColor } from '@/types/database';
import { ToastNotification } from '@/components/ToastNotification';

const EMOJIS = ['🏠', '🏕️', '🍺', '✈️', '🎮', '👥'];

function inferGroupType(emoji: string): 'flat' | 'trip' | 'custom' {
  if (emoji === '🏠') return 'flat';
  if (['🏕️', '✈️'].includes(emoji)) return 'trip';
  return 'custom';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreateGroupScreen() {
  const router = useRouter();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: friends = [] } = useFriends(currentUserId);
  const createGroup = useCreateGroup();

  const [selectedEmoji, setSelectedEmoji] = useState('🏠');
  const [name, setName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(
    new Set(friends.map(f => f.id))
  );

  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const toggleFriend = useCallback((id: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a group name.');
      return;
    }
    try {
      const groupId = await createGroup.mutateAsync({
        name: name.trim(),
        cover_emoji: selectedEmoji,
        group_type: inferGroupType(selectedEmoji),
        memberIds: Array.from(selectedFriends),
      });
      showToast(`${selectedEmoji} ${name.trim()} created ✓`);
      setTimeout(() => {
        router.replace(`/groups/${groupId}` as never);
      }, 400);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not create group.');
    }
  }, [name, selectedEmoji, selectedFriends, createGroup, router, showToast]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Modal drag handle */}
      <View style={styles.dragHandle}>
        <View style={styles.dragBar} />
      </View>

      {/* Header */}
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>New Group</Text>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Emoji picker */}
        <Text style={styles.sectionLabel}>GROUP ICON</Text>
        <View style={styles.emojiRow}>
          {EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              style={[styles.emojiBtn, selectedEmoji === e && styles.emojiBtnSelected]}
              onPress={() => setSelectedEmoji(e)}
              activeOpacity={0.75}
            >
              <Text style={styles.emojiBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Group name */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>GROUP NAME</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Flat, Goa Trip, Office…"
          placeholderTextColor={colors.text3}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          maxLength={40}
          onSubmitEditing={handleCreate}
        />

        {/* Members */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>ADD MEMBERS</Text>
        {friends.length === 0 ? (
          <Text style={styles.noFriendsHint}>
            Add friends first from the Friends tab, then create a group.
          </Text>
        ) : (
          <>
            <View style={styles.chipsWrap}>
              {friends.map(f => {
                const av = avatarColors[(f.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
                const parts = (f.name ?? '').split(' ');
                const initials = parts.length >= 2
                  ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
                  : (f.name ?? '??').slice(0, 2).toUpperCase();
                const isOn = selectedFriends.has(f.id);
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.chip, isOn && styles.chipOn]}
                    onPress={() => toggleFriend(f.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.chipAvatar, { backgroundColor: av.bg }]}>
                      <Text style={[styles.chipAvatarText, { color: av.text }]}>{initials}</Text>
                    </View>
                    <Text style={[styles.chipLabel, isOn && styles.chipLabelOn]}>{f.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.membersHint}>Only friends you've added can be members</Text>
          </>
        )}

        <View style={{ height: 24 }} />

        <TouchableOpacity
          style={[styles.ctaBtn, createGroup.isPending && { opacity: 0.6 }]}
          onPress={handleCreate}
          activeOpacity={0.85}
          disabled={createGroup.isPending}
        >
          {createGroup.isPending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.ctaBtnText}>Create Group →</Text>
          )}
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

  dragHandle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  dragBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderEmphasis },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingVertical: 12,
  },
  modalTitle: { fontFamily: fonts.syne, fontSize: 20, color: colors.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 16, color: colors.text2 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 22 },

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
  emojiBtnSelected: {
    backgroundColor: colors.accentDim, borderColor: colors.accentMid,
  },
  emojiBtnText: { fontSize: 22 },

  nameInput: {
    backgroundColor: colors.cardElevated, borderWidth: 1.5, borderColor: colors.borderEmphasis,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.dmSansSemiBold, fontSize: 16, color: colors.text,
  },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.cardElevated, borderWidth: 1.5, borderColor: colors.borderEmphasis,
    minHeight: 36,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  chipAvatar: {
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  chipAvatarText: { fontSize: 7, fontFamily: fonts.dmSansSemiBold },
  chipLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, color: colors.text },
  chipLabelOn: { color: colors.accent },

  membersHint: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3, marginTop: 8 },
  noFriendsHint: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2 },

  ctaBtn: {
    backgroundColor: colors.accent, borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnText: { fontFamily: fonts.syne, fontSize: 15, color: '#000' },
});
