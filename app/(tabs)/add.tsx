import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { CategoryChip } from '@/components/CategoryChip';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { SplitMode, SplitSheet } from '@/components/SplitSheet';
import { ToastNotification } from '@/components/ToastNotification';
import { formatAmount, isValidAmount, parseAmount, sanitizeAmountInput } from '@/constants/amountUtils';
import { avatarColors, colors } from '@/constants/colors';
import { initialsFromName } from '@/constants/dateFormat';
import { categories } from '@/constants/sampleData';
import { fonts } from '@/constants/typography';
import { useAddExpense } from '@/hooks/useExpenses';
import { useGroups } from '@/hooks/useGroups';
import { useMembers } from '@/hooks/useMembers';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroupStore } from '@/store/useGroupStore';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor } from '@/types/database';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function amountFontSize(len: number) {
  if (len > 8) return 22;
  if (len > 6) return 28;
  if (len > 4) return 34;
  return 42;
}

export default function AddScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const globalGroupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const currentUser = useUserStore(s => s.currentUser);
  const currentUserInitials = currentUser?.name ? initialsFromName(currentUser.name) : 'ME';
  const currentAvatarColor = (currentUser?.avatar_color ?? 'green') as AvatarColor;

  const addExpense = useAddExpense();

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
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [paidBySheetOpen, setPaidBySheetOpen] = useState(false);
  const [amountError, setAmountError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [ctaState, setCtaState] = useState<'idle' | 'success' | 'error'>('idle');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);
  const amountShake = useSharedValue(0);

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
    // Changing participants invalidates any custom split
    if (splitMode !== 'equal') { setSplitMode('equal'); setCustomSplits({}); }
  };

  const resolveCustomSplits = (): Record<string, number> | undefined => {
    if (splitMode === 'equal') return undefined;
    const result: Record<string, number> = {};
    Array.from(selectedPeople).forEach(uid => {
      const raw = parseFloat(customSplits[uid] ?? '0') || 0;
      result[uid] = splitMode === 'percentage'
        ? parseFloat(((raw / 100) * parsedAmount).toFixed(2))
        : raw;
    });
    return result;
  };

  const normalizedAmount = amount.endsWith('.') ? amount.slice(0, -1) : amount;
  const parsedAmount = parseAmount(normalizedAmount);
  const fontSize = amountFontSize(amount.length);
  const splitCount = selectedPeople.size;
  const each = parsedAmount > 0 && splitCount > 0 ? parseFloat((parsedAmount / splitCount).toFixed(2)) : 0;

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const amountShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: amountShake.value }],
  }));

  const resetForm = useCallback(() => {
    setAmount('');
    setTitle('');
    setSelectedCatId(categories[0].id);
    setSelectedPeople(new Set(members.map(m => m.id)));
    setPaidBy(currentUserId);
    setSplitMode('equal');
    setCustomSplits({});
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
      amountShake.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8,  { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(6,  { duration: 50 }),
        withTiming(0,  { duration: 50 }),
      );
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
        customSplits: resolveCustomSplits(),
      },
      {
        onSuccess: () => {
          setCtaState('success');
          setTimeout(() => {
            resetForm();
            setCtaState('idle');
            router.navigate('/');
          }, 1000);
        },
        onError: (err: any) => {
          setCtaState('error');
          showToast(`Couldn't save: ${err?.message ?? 'try again'}`);
          setTimeout(() => setCtaState('idle'), 2000);
        },
      }
    );
  }, [normalizedAmount, parsedAmount, title, selectedCatId, selectedPeople, paidBy, selectedGroupId, currentUserId, addExpense, showToast, resetForm, router, ctaScale]);

  const isMoreSel = !categories.slice(0, 8).find(c => c.id === selectedCatId);
  const moreCat = isMoreSel ? categories.find(c => c.id === selectedCatId) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.flex}>
        {/* Scrollable content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Expense</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Group chips — compact row, no label */}
          {activeGroups.length === 0 ? (
            <View style={styles.noGroupRow}>
              <Text style={styles.noGroupText}>No groups yet · </Text>
              <TouchableOpacity onPress={() => router.push('/groups/create' as never)}>
                <Text style={styles.noGroupLink}>Create one</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.groupRow}>
              <Text style={styles.groupInLabel}>in</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupChipsContent}
                style={styles.groupChipsScroll}
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

          {/* Amount — hero, no box */}
          <Animated.View style={[styles.amountSection, amountShakeStyle]}>
            <View style={styles.amountRow}>
              <Text style={[styles.rupee, { fontSize: fontSize * 0.7, lineHeight: fontSize * 1.15 }]}>₹</Text>
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
            {!!amountError && <Text style={styles.fieldErrorCenter}>{amountError}</Text>}
          </Animated.View>

          {/* Title — bare, centered, flows under the amount */}
          <View style={styles.titleSection}>
            <TextInput
              style={[styles.titleInput, !!titleError && styles.titleInputError]}
              value={title}
              onChangeText={t => { setTitle(t); if (titleError) setTitleError(''); }}
              placeholder="What's this for?"
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
              returnKeyType="done"
              maxLength={60}
              textAlign="center"
            />
            {!!titleError && <Text style={styles.fieldErrorCenter}>{titleError}</Text>}
          </View>

          {/* Details card — Category / Paid By / Split With */}
          <View style={styles.detailsCard}>

            {/* Category */}
            <View style={styles.cardRow}>
              <Text style={styles.cardRowLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChipsContent}>
                {categories.slice(0, 8).map(cat => (
                  <CategoryChip
                    key={cat.id}
                    category={cat}
                    selected={selectedCatId === cat.id}
                    onPress={() => setSelectedCatId(cat.id)}
                    emojiOnly
                  />
                ))}
                <TouchableOpacity
                  style={[styles.moreCatChip, isMoreSel && styles.moreCatChipSelected]}
                  onPress={() => setCatPickerOpen(true)}
                >
                  <Text style={[styles.moreCatText, isMoreSel && styles.moreCatTextSelected]}>
                    {moreCat ? `${moreCat.emoji} ${moreCat.label}` : 'More +'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              {(() => {
                const sel = categories.find(c => c.id === selectedCatId);
                return sel ? (
                  <Text style={styles.catSelectedLabel}>{sel.emoji}  {sel.label}</Text>
                ) : null;
              })()}
            </View>

            {/* Paid By — single tappable row */}
            {selectedGroupId && members.length > 0 && (() => {
              const payer = members.find(m => m.id === paidBy) ?? members[0];
              const av = avatarColors[(payer.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
              const label = payer.id === currentUserId ? 'You' : (payer.name ?? '?');
              return (
                <>
                  <View style={styles.cardDivider} />
                  <TouchableOpacity style={styles.paidByRow} onPress={() => setPaidBySheetOpen(true)} activeOpacity={0.7}>
                    <Text style={styles.cardRowLabel}>PAID BY</Text>
                    <View style={styles.paidByRight}>
                      <View style={[styles.paidByAvatar, { backgroundColor: av.bg }]}>
                        <Text style={[styles.paidByAvatarText, { color: av.text }]}>
                          {payer.id === currentUserId ? currentUserInitials : initialsFromName(payer.name)}
                        </Text>
                      </View>
                      <Text style={styles.paidByName}>{label}</Text>
                      <Text style={styles.paidByChevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                </>
              );
            })()}

            {/* Split With — avatar circles + split type pill in header */}
            {selectedGroupId && (
              <>
                <View style={styles.cardDivider} />
                <View style={styles.cardRow}>
                  <View style={styles.splitWithHeader}>
                    <Text style={styles.cardRowLabel}>SPLIT WITH</Text>
                    <TouchableOpacity
                      style={[styles.splitPill, splitMode !== 'equal' && styles.splitPillActive]}
                      onPress={() => setSplitSheetOpen(true)}
                      activeOpacity={0.7}
                      disabled={selectedPeople.size === 0}
                    >
                      <Text style={[styles.splitPillText, splitMode !== 'equal' && styles.splitPillTextActive]}>
                        {splitMode === 'equal' ? '= Equal' : splitMode === 'amount' ? '≠ Amount' : '≠ %'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {membersLoading ? (
                    <Text style={styles.loadingText}>Loading members…</Text>
                  ) : members.length === 0 ? (
                    <Text style={styles.loadingText}>No members · Add in group settings</Text>
                  ) : (
                    <View style={styles.avatarCircleRow}>
                      {members.map(m => {
                        const av = avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
                        const selected = selectedPeople.has(m.id);
                        const splitAmt = selected
                          ? splitMode === 'equal'
                            ? each
                            : splitMode === 'percentage'
                              ? parseFloat(((parseFloat(customSplits[m.id] ?? '0') / 100) * parsedAmount).toFixed(2))
                              : parseFloat(customSplits[m.id] ?? '0')
                          : 0;
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={styles.avatarCircleItem}
                            onPress={() => togglePerson(m.id)}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.avatarCircle, { backgroundColor: selected ? av.bg : colors.cardElevated }, selected && styles.avatarCircleOn]}>
                              <Text style={[styles.avatarCircleText, { color: selected ? av.text : colors.text3 }]}>
                                {m.id === currentUserId ? currentUserInitials : initialsFromName(m.name)}
                              </Text>
                            </View>
                            <Text style={[styles.avatarCircleAmt, !selected && styles.avatarCircleAmtDim]}>
                              {selected && splitAmt > 0 ? formatAmount(splitAmt) : '—'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </>
            )}

          </View>
        </ScrollView>

        {/* Pinned CTA — absolute so it's always visible */}
        <View style={[styles.footer, { paddingBottom: tabBarHeight + 8 }]}>
          <AnimatedTouchable
            style={[
              styles.cta,
              ctaStyle,
              ctaState === 'success' && styles.ctaSuccess,
              ctaState === 'error'   && styles.ctaError,
              (addExpense.isPending || activeGroups.length === 0) && { opacity: 0.4 },
              parsedAmount === 0 && ctaState === 'idle' && { opacity: 0.5 },
            ]}
            onPress={handleAdd}
            activeOpacity={0.85}
            disabled={addExpense.isPending || activeGroups.length === 0 || ctaState !== 'idle'}
          >
            <Text style={styles.ctaText}>
              {ctaState === 'success' ? '✓ Added!' :
               ctaState === 'error'   ? 'Failed — try again' :
               addExpense.isPending   ? 'Saving…' : 'Add Expense →'}
            </Text>
          </AnimatedTouchable>
        </View>
      </View>

      {/* Paid By picker sheet */}
      <Modal visible={paidBySheetOpen} transparent animationType="slide" onRequestClose={() => setPaidBySheetOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setPaidBySheetOpen(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Paid by</Text>
            {members.map(m => {
              const av = avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
              const isSelected = paidBy === m.id;
              const label = m.id === currentUserId ? 'You' : (m.name ?? '?');
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.sheetRow, isSelected && styles.sheetRowSelected]}
                  onPress={() => { setPaidBy(m.id); setPaidBySheetOpen(false); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetAvatar, { backgroundColor: av.bg }]}>
                    <Text style={[styles.sheetAvatarText, { color: av.text }]}>
                      {m.id === currentUserId ? currentUserInitials : initialsFromName(m.name)}
                    </Text>
                  </View>
                  <Text style={[styles.sheetRowName, isSelected && styles.sheetRowNameSelected]}>{label}</Text>
                  {isSelected && <Text style={styles.sheetCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      <ToastNotification message={toast} visible={toastVisible} />
      <CategoryPickerModal
        visible={catPickerOpen}
        selectedId={selectedCatId}
        onSelect={setSelectedCatId}
        onClose={() => setCatPickerOpen(false)}
      />
      <SplitSheet
        visible={splitSheetOpen}
        onClose={() => setSplitSheetOpen(false)}
        members={members.filter(m => selectedPeople.has(m.id))}
        totalAmount={parsedAmount}
        mode={splitMode}
        splits={customSplits}
        currentUserId={currentUserId}
        onConfirm={(mode, splits) => {
          setSplitMode(mode);
          setCustomSplits(splits);
          setSplitSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  flex:   { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 120,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  // Group chips row
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  groupInLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text2,
    flexShrink: 0,
  },
  groupChipsScroll: { flex: 1 },
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
  groupChipOn:     { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  groupChipText:   { fontFamily: fonts.dmSansSemiBold, fontSize: 12, color: colors.text2 },
  groupChipTextOn: { color: colors.accent },

  // No-group inline row
  noGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  noGroupText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text2,
  },
  noGroupLink: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },

  // Amount hero
  amountSection: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    padding: 0,
    margin: 0,
    minWidth: 48,
  },

  // Title
  titleSection: { marginBottom: 20 },
  titleInput: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 24,
  },
  titleInputError: { color: colors.danger },

  // Details card
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 90,
    overflow: 'hidden',
  },
  cardRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  cardRowLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  hChipsContent: { gap: 8, paddingBottom: 2 },
  catSelectedLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },

  // More category chip
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
  moreCatChipSelected: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  moreCatText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text2,
    textAlign: 'center',
  },
  moreCatTextSelected: { color: colors.accent },

  // Loading / empty text
  loadingText: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text3,
    paddingVertical: 4,
  },

  // Paid By row
  paidByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 68,
  },
  paidByRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paidByAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidByAvatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 11,
    fontWeight: '700',
  },
  paidByName: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  paidByChevron: {
    fontFamily: fonts.dmSans,
    fontSize: 18,
    color: colors.text3,
    lineHeight: 20,
  },

  // Split With header + avatar circles
  splitWithHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
  },
  splitPillActive:     { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  splitPillText:       { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.text2 },
  splitPillTextActive: { color: colors.accent },
  avatarCircleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  avatarCircleItem: {
    alignItems: 'center',
    gap: 5,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarCircleOn: {
    borderColor: colors.borderEmphasis,
  },
  avatarCircleText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '700',
  },

  avatarCircleAmt: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '600',
    color: colors.accent,
  },
  avatarCircleAmtDim: {
    color: colors.text3,
  },

  // Paid By sheet
  sheetRoot:      { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheetContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: fonts.syne,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  sheetRowSelected: { backgroundColor: colors.accentDim },
  sheetAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetAvatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '700',
  },
  sheetRowName: {
    flex: 1,
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sheetRowNameSelected: { color: colors.accent },
  sheetCheck: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    color: colors.accent,
  },

  // Errors
  fieldError: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.danger,
    marginTop: 6,
    paddingLeft: 2,
  },
  fieldErrorCenter: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.danger,
    marginTop: 8,
    textAlign: 'center',
  },

  // Pinned footer + CTA
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaSuccess: {
    backgroundColor: '#00b87a',
    shadowColor: '#00b87a',
  },
  ctaError: {
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
  },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
});
