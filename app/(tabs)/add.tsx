import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';
import { CategoryChip } from '@/components/CategoryChip';
import { PersonChip } from '@/components/PersonChip';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { ToastNotification } from '@/components/ToastNotification';
import { sanitizeAmountInput, isValidAmount, parseAmount, formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroupStore } from '@/store/useGroupStore';
import { useUserStore } from '@/store/useUserStore';
import { useMembers } from '@/hooks/useMembers';
import { useGroups } from '@/hooks/useGroups';
import { useAddExpense } from '@/hooks/useExpenses';
import type { AvatarColor } from '@/types/database';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function amountFontSize(len: number) {
  if (len > 8) return 20;
  if (len > 6) return 24;
  if (len > 4) return 28;
  return 34;
}

export default function AddScreen() {
  const router = useRouter();
  const globalGroupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const currentUser = useUserStore(s => s.currentUser);
  const currentUserInitials = currentUser?.name ? initialsFromName(currentUser.name) : 'ME';
  const currentAvatarColor = (currentUser?.avatar_color ?? 'green') as AvatarColor;

  const addExpense = useAddExpense();
  const { width } = useWindowDimensions();
  const chipWidth = (width - 44 - 16) / 3;

  // Local group selection — pre-filled from global context
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(globalGroupId);

  const { data: groups = [] } = useGroups(currentUserId);
  const activeGroups = groups.filter(g => !g.archived_at);

  // Auto-select first group when groups load and nothing is selected
  useEffect(() => {
    if (!selectedGroupId && activeGroups.length > 0) {
      setSelectedGroupId(activeGroups[0].id);
    }
  }, [activeGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: members = [], isLoading: membersLoading } = useMembers(selectedGroupId);

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCatId, setSelectedCatId] = useState(categories[0].id);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [paidBy, setPaidBy] = useState<string>(currentUserId);
  const [amountError, setAmountError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);

  // Track which group we last defaulted members for, so switching groups re-defaults
  const defaultedForGroup = useRef<string | null>(null);
  useEffect(() => {
    if (defaultedForGroup.current === selectedGroupId) return;
    if (members.length === 0) return;
    setSelectedPeople(new Set(members.map(m => m.id)));
    defaultedForGroup.current = selectedGroupId;
  }, [members, selectedGroupId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const togglePerson = (id: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const normalizedAmount = amount.endsWith('.') ? amount.slice(0, -1) : amount;
  const parsedAmount = parseAmount(normalizedAmount);
  const fontSize = amountFontSize(amount.length);
  const splitCount = selectedPeople.size;
  const each = parsedAmount > 0 && splitCount > 0 ? parseFloat((parsedAmount / splitCount).toFixed(2)) : 0;
  const splitText = each > 0
    ? `Each pays ${formatAmount(each)} (${splitCount} ${splitCount === 1 ? 'person' : 'people'})`
    : `Split with ${splitCount} ${splitCount === 1 ? 'person' : 'people'}`;

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const resetForm = useCallback(() => {
    setAmount('');
    setTitle('');
    setSelectedCatId(categories[0].id);
    setSelectedPeople(new Set(members.map(m => m.id)));
    setPaidBy(currentUserId);
    setAmountError('');
    setTitleError('');
    setSelectedGroupId(globalGroupId);
    defaultedForGroup.current = null;
  }, [members, globalGroupId, currentUserId]);

  const handleCancel = useCallback(() => {
    resetForm();
    router.navigate('/');
  }, [resetForm, router]);

  const handleAdd = useCallback(() => {
    let hasError = false;
    if (!isValidAmount(normalizedAmount)) {
      setAmountError('Enter a valid amount');
      hasError = true;
    }
    if (!title.trim()) {
      setTitleError('Title is required');
      hasError = true;
    }
    if (selectedPeople.size === 0) {
      showToast('Select at least one person to split with');
      return;
    }
    if (hasError) return;

    ctaScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 120 })
    );

    const splitWith = Array.from(selectedPeople);

    if (!selectedGroupId) {
      showToast('Select a group to add this expense');
      return;
    }

    addExpense.mutate(
      {
        groupId: selectedGroupId,
        title: title.trim(),
        amount: parsedAmount,
        category: selectedCatId,
        paidBy,
        addedBy: currentUserId,
        splitWith,
      },
      {
        onSuccess: () => {
          showToast(`✓ ${formatAmount(parsedAmount)} added!`);
          resetForm();
          setTimeout(() => router.navigate('/'), 600);
        },
        onError: (err: any) => {
          showToast(`Couldn't save: ${err?.message ?? 'try again'}`);
        },
      }
    );
  }, [normalizedAmount, parsedAmount, title, selectedCatId, selectedPeople, paidBy, selectedGroupId, currentUserId, addExpense, showToast, resetForm, router, ctaScale]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Add Expense</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>AMOUNT</Text>
          <View style={styles.amountBox}>
            <Text style={[styles.rupee, { fontSize: fontSize * 0.65, lineHeight: fontSize * 1.1 }]}>
              ₹
            </Text>
            <TextInput
              style={[styles.amountInput, { fontSize }]}
              value={amount}
              onChangeText={t => { setAmount(sanitizeAmountInput(t)); if (amountError) setAmountError(''); }}
              keyboardType="decimal-pad"
              autoFocus
              selectionColor={colors.accent}
              placeholderTextColor={colors.text3}
              placeholder="0"
            />
          </View>
          {!!amountError && <Text style={styles.fieldError}>{amountError}</Text>}
        </View>

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TITLE *</Text>
          <View style={[styles.noteBox, !!titleError && styles.inputError]}>
            <TextInput
              style={styles.noteInput}
              value={title}
              onChangeText={t => { setTitle(t); if (titleError) setTitleError(''); }}
              placeholder="What's this for?"
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
              returnKeyType="done"
              maxLength={60}
            />
          </View>
          {!!titleError && <Text style={styles.fieldError}>{titleError}</Text>}
        </View>

        {/* Group */}
        {activeGroups.length === 0 ? (
          <View style={styles.noGroupBanner}>
            <Text style={styles.noGroupEmoji}>🗂️</Text>
            <Text style={styles.noGroupTitle}>No groups yet</Text>
            <Text style={styles.noGroupSub}>Create a group to start splitting expenses.</Text>
            <TouchableOpacity
              style={styles.noGroupBtn}
              onPress={() => router.push('/groups/create' as never)}
              activeOpacity={0.8}
            >
              <Text style={styles.noGroupBtnText}>+ Create Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>GROUP</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupChipsContent}
            >
              {activeGroups.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupChip, selectedGroupId === g.id && styles.groupChipOn]}
                  onPress={() => {
                    setSelectedGroupId(g.id);
                    setSelectedPeople(new Set());
                    setPaidBy(currentUserId);
                    defaultedForGroup.current = null;
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.groupChipText, selectedGroupId === g.id && styles.groupChipTextOn]}>
                    {g.cover_emoji} {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.catGrid}>
            {categories.slice(0, 8).map((cat) => (
              <CategoryChip
                key={cat.id}
                category={cat}
                selected={selectedCatId === cat.id}
                onPress={() => setSelectedCatId(cat.id)}
                style={{ width: chipWidth }}
              />
            ))}
            {(() => {
              const isMoreSel = !categories.slice(0, 8).find(c => c.id === selectedCatId);
              const moreCat = isMoreSel ? categories.find(c => c.id === selectedCatId) : null;
              return (
                <TouchableOpacity
                  style={[styles.moreCatChip, { width: chipWidth }, isMoreSel && styles.moreCatChipSelected]}
                  onPress={() => setCatPickerOpen(true)}
                >
                  <Text style={[styles.moreCatText, isMoreSel && styles.moreCatTextSelected]}>
                    {moreCat ? `${moreCat.emoji} ${moreCat.label}` : 'More +'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        </View>

        {/* Paid By */}
        {selectedGroupId && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PAID BY</Text>
            <View style={styles.peopleRow}>
              {members.map(m => (
                <PersonChip
                  key={m.id}
                  label={m.id === currentUserId ? 'You' : (m.name ?? '?')}
                  selected={paidBy === m.id}
                  onPress={() => setPaidBy(m.id)}
                  initials={m.id === currentUserId ? currentUserInitials : initialsFromName(m.name)}
                  avatarColor={(m.avatar_color ?? 'green') as AvatarColor}
                />
              ))}
            </View>
          </View>
        )}

        {/* Split With */}
        {selectedGroupId && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SPLIT WITH</Text>
            {membersLoading ? (
              <Text style={styles.splitCalc}>Loading members…</Text>
            ) : members.length === 0 ? (
              <Text style={styles.splitCalc}>No members · Add members in group settings</Text>
            ) : (
              <>
                <View style={styles.peopleRow}>
                  {members.map(m => (
                    <PersonChip
                      key={m.id}
                      label={m.id === currentUserId ? 'You' : (m.name ?? '?')}
                      selected={selectedPeople.has(m.id)}
                      onPress={() => togglePerson(m.id)}
                      initials={m.id === currentUserId ? currentUserInitials : initialsFromName(m.name)}
                      avatarColor={(m.avatar_color ?? 'green') as AvatarColor}
                    />
                  ))}
                </View>
                <View style={styles.splitCalcRow}>
                  <Text style={styles.splitCalc}>{splitText}</Text>
                  {selectedPeople.size > 0 && each > 0 && (
                    <View style={styles.eachBadge}>
                      <Text style={styles.eachBadgeText}>{formatAmount(each)} each</Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {/* CTA */}
        <AnimatedTouchable
          style={[styles.cta, ctaStyle, (addExpense.isPending || activeGroups.length === 0) && { opacity: 0.4 }]}
          onPress={handleAdd}
          activeOpacity={0.85}
          disabled={addExpense.isPending || activeGroups.length === 0}
        >
          <Text style={styles.ctaText}>
            {addExpense.isPending ? 'Saving…' : 'Add Expense →'}
          </Text>
        </AnimatedTouchable>
      </ScrollView>

      <ToastNotification message={toast} visible={toastVisible} />
      <CategoryPickerModal
        visible={catPickerOpen}
        selectedId={selectedCatId}
        onSelect={setSelectedCatId}
        onClose={() => setCatPickerOpen(false)}
      />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  cancelBtn: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text2,
  },
  amountSection: { alignItems: 'center', marginBottom: 22 },
  amountLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 10,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 2,
    alignSelf: 'stretch',
  },
  rupee: {
    fontFamily: fonts.syne,
    fontWeight: '800',
    color: colors.text2,
    flexShrink: 0,
  },
  amountInput: {
    fontFamily: fonts.syne,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
    padding: 0,
    margin: 0,
    textAlign: 'center',
    minWidth: 0,
  },
  section: { marginBottom: 20 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 8,
  },
  noteBox: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteInput: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    padding: 0,
    margin: 0,
  },
  moreCatChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    minHeight: 36,
  },
  moreCatChipSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  moreCatText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text2,
    textAlign: 'center',
  },
  moreCatTextSelected: { color: colors.accent },
  fieldError: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.danger,
    marginTop: 6,
    paddingLeft: 2,
  },
  inputError: { borderColor: colors.danger },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitCalc: {
    fontFamily: fonts.dmSansMedium,
    fontSize: 12,
    fontWeight: '500',
    color: colors.text2,
    marginTop: 10,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
  groupChipsContent: { gap: 8, paddingBottom: 2 },
  groupChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.borderEmphasis,
    flexShrink: 0,
    minHeight: 36,
    justifyContent: 'center',
  },
  groupChipOn: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  groupChipText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, color: colors.text2 },
  groupChipTextOn: { color: colors.accent },

  // Split calc row
  splitCalcRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
  },
  eachBadge: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  eachBadgeText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent,
  },

  // No-groups empty state
  noGroupBanner: {
    alignItems: 'center', paddingVertical: 32, gap: 6, marginBottom: 8,
    backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
  },
  noGroupEmoji: { fontSize: 36, marginBottom: 4 },
  noGroupTitle: { fontFamily: fonts.syne, fontSize: 16, color: colors.text },
  noGroupSub: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2, textAlign: 'center', paddingHorizontal: 24 },
  noGroupBtn: {
    marginTop: 10, backgroundColor: colors.accent, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  noGroupBtnText: { fontFamily: fonts.syne, fontSize: 13, fontWeight: '800', color: '#000' },
});
