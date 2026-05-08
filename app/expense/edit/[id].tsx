import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';
import { CategoryChip } from '@/components/CategoryChip';
import { ToastNotification } from '@/components/ToastNotification';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { SplitSheet, SplitMode } from '@/components/SplitSheet';
import { sanitizeAmountInput, isValidAmount, parseAmount, formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroupStore } from '@/store/useGroupStore';
import { useUserStore } from '@/store/useUserStore';
import { useMembers } from '@/hooks/useMembers';
import { useExpense, useUpdateExpense } from '@/hooks/useExpenses';
import type { AvatarColor } from '@/types/database';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function amountFontSize(len: number) {
  if (len > 8) return 20;
  if (len > 6) return 24;
  if (len > 4) return 28;
  return 34;
}

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const currentUser = useUserStore(s => s.currentUser);
  const currentUserInitials = currentUser?.name ? initialsFromName(currentUser.name) : 'ME';

  const { data: expense, isLoading } = useExpense(id);
  const { data: members = [] } = useMembers(expense?.group_id ?? groupId);
  const updateExpense = useUpdateExpense();

  // ── Form state ──
  const [amount, setAmount]               = useState('');
  const [title, setTitle]                 = useState('');
  const [selectedCatId, setSelectedCatId] = useState(categories[0].id);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [paidBy, setPaidBy]               = useState<string>(currentUserId);
  const [splitMode, setSplitMode]         = useState<SplitMode>('equal');
  const [customSplits, setCustomSplits]   = useState<Record<string, string>>({});
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [paidBySheetOpen, setPaidBySheetOpen] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [amountError, setAmountError]     = useState('');
  const [titleError, setTitleError]       = useState('');
  const [ctaState, setCtaState]           = useState<'idle' | 'success' | 'error'>('idle');
  const [toast, setToast]                 = useState('');
  const [toastVisible, setToastVisible]   = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctaScale    = useSharedValue(1);
  const amountShake = useSharedValue(0);
  const ctaStyle       = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));
  const amountShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: amountShake.value }] }));

  // Hydrate form from the loaded expense, exactly once
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !expense) return;
    setAmount(String(expense.amount));
    setTitle(expense.title ?? '');
    setSelectedCatId(expense.category ?? categories[0].id);
    setPaidBy(expense.paid_by ?? currentUserId);
    const expSplits = expense.splits ?? [];
    setSelectedPeople(new Set(expSplits.map(s => s.user_id)));

    const amounts = expSplits.map(s => s.amount_owed);
    const isUnequal = amounts.length > 1 && amounts.some(a => Math.abs(a - amounts[0]) > 0.01);
    if (isUnequal) {
      setSplitMode('amount');
      const c: Record<string, string> = {};
      expSplits.forEach(s => { c[s.user_id] = String(s.amount_owed); });
      setCustomSplits(c);
    }
    hydrated.current = true;
  }, [expense, currentUserId]);

  const normalizedAmount = amount.endsWith('.') ? amount.slice(0, -1) : amount;
  const parsedAmount = parseAmount(normalizedAmount);
  const fontSize     = amountFontSize(amount.length);
  const splitCount   = selectedPeople.size;
  const each = parsedAmount > 0 && splitCount > 0
    ? parseFloat((parsedAmount / splitCount).toFixed(2)) : 0;

  const isMoreSel = !categories.slice(0, 8).find(c => c.id === selectedCatId);
  const moreCat   = isMoreSel ? categories.find(c => c.id === selectedCatId) : null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const togglePerson = useCallback((personId: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId); else next.add(personId);
      return next;
    });
    if (splitMode !== 'equal') { setSplitMode('equal'); setCustomSplits({}); }
  }, [splitMode]);

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

  const handleSave = useCallback(() => {
    if (!expense) return;
    let hasError = false;
    if (!isValidAmount(normalizedAmount)) {
      setAmountError('Enter a valid amount');
      amountShake.value = withSequence(
        withTiming(-8, { duration: 50 }), withTiming(8,  { duration: 50 }),
        withTiming(-6, { duration: 50 }), withTiming(6,  { duration: 50 }),
        withTiming(0,  { duration: 50 }),
      );
      hasError = true;
    }
    if (!title.trim()) { setTitleError('Title is required'); hasError = true; }
    if (selectedPeople.size === 0) { showToast('Select at least one person to split with'); return; }
    if (hasError) return;

    ctaScale.value = withSequence(withTiming(0.97, { duration: 100 }), withTiming(1, { duration: 120 }));

    updateExpense.mutate(
      {
        expenseId: expense.id,
        groupId: expense.group_id,
        title: title.trim(),
        amount: parsedAmount,
        category: selectedCatId,
        splitWith: Array.from(selectedPeople),
        paidBy,
        customSplits: resolveCustomSplits(),
      },
      {
        onSuccess: () => {
          setCtaState('success');
          showToast('Changes saved ✓');
          setTimeout(() => router.back(), 900);
        },
        onError: (err: any) => {
          setCtaState('error');
          showToast(`Couldn't save: ${err?.message ?? 'try again'}`);
          setTimeout(() => setCtaState('idle'), 2000);
        },
      }
    );
  }, [expense, normalizedAmount, parsedAmount, title, selectedCatId, selectedPeople, paidBy,
      updateExpense, showToast, router, ctaScale, amountShake]);

  // ── Loading / not-found ──
  if (isLoading && !expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>Expense not found</Text>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.notFoundBack}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const payer = members.find(m => m.id === paidBy) ?? members[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.flex}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Edit Expense</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Amount — hero */}
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

          {/* Title — bare centered */}
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

          {/* Details card */}
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
                return sel ? <Text style={styles.catSelectedLabel}>{sel.emoji}  {sel.label}</Text> : null;
              })()}
            </View>

            {/* Paid By — tappable row */}
            {payer && (() => {
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

            {/* Split With — avatar circles + split type pill */}
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
            </View>

          </View>
        </ScrollView>

        {/* Pinned footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <AnimatedTouchable
            style={[
              styles.cta,
              ctaStyle,
              ctaState === 'success' && styles.ctaSuccess,
              ctaState === 'error'   && styles.ctaError,
              parsedAmount === 0 && ctaState === 'idle' && { opacity: 0.5 },
              (updateExpense.isPending || ctaState !== 'idle') && { opacity: 1 },
            ]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={updateExpense.isPending || ctaState !== 'idle'}
          >
            <Text style={styles.ctaText}>
              {ctaState === 'success'   ? '✓ Saved!' :
               ctaState === 'error'     ? 'Failed — try again' :
               updateExpense.isPending  ? 'Saving…' : 'Save Changes →'}
            </Text>
          </AnimatedTouchable>
        </View>

      </View>

      {/* Paid By picker */}
      <Modal visible={paidBySheetOpen} transparent animationType="slide" onRequestClose={() => setPaidBySheetOpen(false)}>
        <View style={styles.pickerRoot}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPaidBySheetOpen(false)} />
          <View style={[styles.pickerContainer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Paid by</Text>
            {members.map(m => {
              const av = avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
              const isSelected = paidBy === m.id;
              const label = m.id === currentUserId ? 'You' : (m.name ?? '?');
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                  onPress={() => { setPaidBy(m.id); setPaidBySheetOpen(false); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: av.bg }]}>
                    <Text style={[styles.pickerAvatarText, { color: av.text }]}>
                      {m.id === currentUserId ? currentUserInitials : initialsFromName(m.name)}
                    </Text>
                  </View>
                  <Text style={[styles.pickerRowName, isSelected && styles.pickerRowNameSelected]}>{label}</Text>
                  {isSelected && <Text style={styles.pickerCheck}>✓</Text>}
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
        onConfirm={(mode, splits) => { setSplitMode(mode); setCustomSplits(splits); setSplitSheetOpen(false); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontFamily: fonts.syne, fontSize: 16, fontWeight: '800', color: colors.text },
  notFoundBack: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.accent },

  // Header
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
  screenTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: fonts.syne, fontSize: 17, fontWeight: '800', color: colors.text,
  },
  headerSpacer: { width: 36 },

  // Amount hero
  amountSection: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rupee: { fontFamily: fonts.syne, fontWeight: '800', color: colors.text2, flexShrink: 0 },
  amountInput: {
    fontFamily: fonts.syne, fontWeight: '800', color: colors.text,
    padding: 0, margin: 0, minWidth: 48,
  },
  fieldErrorCenter: {
    fontFamily: fonts.dmSans, fontSize: 11, color: colors.danger,
    marginTop: 8, textAlign: 'center',
  },

  // Title
  titleSection: { marginBottom: 20 },
  titleInput: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 16, fontWeight: '600',
    color: colors.text, textAlign: 'center', paddingVertical: 0, paddingHorizontal: 24,
  },
  titleInputError: { color: colors.danger },

  // Details card
  detailsCard: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 20,
  },
  cardRow: { paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  cardRowLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text2,
  },
  cardDivider: { height: 1, backgroundColor: colors.border },
  hChipsContent: { gap: 8, paddingBottom: 2 },
  catSelectedLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '600', color: colors.accent },

  moreCatChip: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, paddingVertical: 7,
    borderRadius: 14, backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', minHeight: 36,
  },
  moreCatChipSelected: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  moreCatText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600',
    color: colors.text2, textAlign: 'center',
  },
  moreCatTextSelected: { color: colors.accent },

  // Paid By row
  paidByRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16, minHeight: 68,
  },
  paidByRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paidByAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  paidByAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '700' },
  paidByName: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text },
  paidByChevron: { fontFamily: fonts.dmSans, fontSize: 18, color: colors.text3, lineHeight: 20 },

  // Split With
  splitWithHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  splitPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
  },
  splitPillActive:     { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  splitPillText:       { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.text2 },
  splitPillTextActive: { color: colors.accent },
  avatarCircleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarCircleItem: { alignItems: 'center', gap: 5 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarCircleOn: { borderColor: colors.borderEmphasis },
  avatarCircleText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  avatarCircleAmt: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '600', color: colors.accent },
  avatarCircleAmtDim: { color: colors.text3 },

  // Pinned footer + CTA
  footer: {
    paddingHorizontal: 22, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  cta: {
    backgroundColor: colors.accent, borderRadius: 14, height: 46,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 16, elevation: 10,
  },
  ctaSuccess: { backgroundColor: '#00b87a', shadowColor: '#00b87a' },
  ctaError:   { backgroundColor: colors.danger, shadowColor: colors.danger },
  ctaText: { fontFamily: fonts.syne, fontSize: 15, fontWeight: '800', color: '#000' },

  // Paid By picker sheet
  pickerRoot:      { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  pickerContainer: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.borderEmphasis, paddingTop: 12, paddingHorizontal: 20,
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20,
  },
  pickerTitle: { fontFamily: fonts.syne, fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 16 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
  },
  pickerRowSelected: { backgroundColor: colors.accentDim },
  pickerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  pickerRowName: { flex: 1, fontFamily: fonts.dmSansSemiBold, fontSize: 14, fontWeight: '600', color: colors.text },
  pickerRowNameSelected: { color: colors.accent },
  pickerCheck: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, color: colors.accent },
});
