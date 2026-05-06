import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  Platform, TouchableOpacity, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';
import { CategoryChip } from '@/components/CategoryChip';
import { PersonChip } from '@/components/PersonChip';
import { ToastNotification } from '@/components/ToastNotification';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { sanitizeAmountInput, isValidAmount, parseAmount, formatAmount, formatDisplayName } from '@/constants/amountUtils';
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
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const currentUser = useUserStore(s => s.currentUser);
  const currentUserInitials = currentUser?.name ? initialsFromName(currentUser.name) : 'ME';
  const currentAvatarColor = (currentUser?.avatar_color ?? 'green') as AvatarColor;

  const { data: expense, isLoading } = useExpense(id);
  const { data: members = [] } = useMembers(expense?.group_id ?? groupId);
  const updateExpense = useUpdateExpense();
  const { width } = useWindowDimensions();
  const chipWidth = (width - 44 - 16) / 3;

  // ── Form state ──
  const [amount, setAmount]               = useState('');
  const [title, setTitle]                 = useState('');
  const [selectedCatId, setSelectedCatId] = useState(categories[0].id);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [paidBy, setPaidBy]               = useState<string>(currentUserId);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [amountError, setAmountError]     = useState('');
  const [titleError, setTitleError]       = useState('');
  const [toast, setToast]                 = useState('');
  const [toastVisible, setToastVisible]   = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);

  // Hydrate form from the loaded expense, exactly once
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !expense) return;
    setAmount(String(expense.amount));
    setTitle(expense.title ?? '');
    setSelectedCatId(expense.category ?? categories[0].id);
    setPaidBy(expense.paid_by ?? currentUserId);
    // Include ALL split members — no exclusions
    setSelectedPeople(new Set((expense.splits ?? []).map(s => s.user_id)));
    hydrated.current = true;
  }, [expense, currentUserId]);

  const normalizedAmount = amount.endsWith('.') ? amount.slice(0, -1) : amount;
  const parsedAmount = parseAmount(normalizedAmount);
  const fontSize = amountFontSize(amount.length);
  const splitCount = selectedPeople.size;
  const each = parsedAmount > 0 && splitCount > 0
    ? parseFloat((parsedAmount / splitCount).toFixed(2))
    : 0;
  const splitText = each > 0
    ? `Each pays ${formatAmount(each)} (${splitCount} ${splitCount === 1 ? 'person' : 'people'})`
    : `Split with ${splitCount} ${splitCount === 1 ? 'person' : 'people'}`;

  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const togglePerson = useCallback((personId: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!expense) return;
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
      withTiming(1,    { duration: 120 })
    );

    updateExpense.mutate(
      {
        expenseId: expense.id,
        groupId: expense.group_id,
        title: title.trim(),
        amount: parsedAmount,
        category: selectedCatId,
        splitWith: Array.from(selectedPeople),
        paidBy,
      },
      {
        onSuccess: () => {
          showToast('Changes saved ✓');
          setTimeout(() => router.back(), 600);
        },
        onError: (err: any) => {
          showToast(`Couldn't save: ${err?.message ?? 'try again'}`);
        },
      }
    );
  }, [expense, normalizedAmount, parsedAmount, title, selectedCatId, selectedPeople, paidBy, updateExpense, showToast, router, ctaScale]);

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
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Edit Expense</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Amount */}
        <View style={styles.amountSection}>
          <Text style={styles.sectionLabel}>AMOUNT</Text>
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
          <View style={[styles.inputBox, !!titleError && styles.inputError]}>
            <TextInput
              style={styles.inputText}
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
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PAID BY</Text>
          <View style={styles.peopleRow}>
            {members.map(m => (
              <PersonChip
                key={m.id}
                label={m.id === currentUserId ? 'You' : formatDisplayName(m.name)}
                selected={paidBy === m.id}
                onPress={() => setPaidBy(m.id)}
                initials={m.id === currentUserId ? currentUserInitials : initialsFromName(m.name)}
                avatarColor={(m.avatar_color ?? 'green') as AvatarColor}
              />
            ))}
          </View>
        </View>

        {/* Split With */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SPLIT WITH</Text>
          <View style={styles.peopleRow}>
            {members.map(m => (
              <PersonChip
                key={m.id}
                label={m.id === currentUserId ? 'You' : formatDisplayName(m.name)}
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
        </View>

        {/* Save CTA */}
        <AnimatedTouchable
          style={[styles.cta, ctaStyle, updateExpense.isPending && { opacity: 0.7 }]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={updateExpense.isPending}
        >
          <Text style={styles.ctaText}>
            {updateExpense.isPending ? 'Saving…' : 'Save Changes →'}
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
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  notFoundText: {
    fontFamily: fonts.syne, fontSize: 16, fontWeight: '800', color: colors.text,
  },
  notFoundBack: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.accent,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22, color: colors.text, lineHeight: 26, marginTop: -2,
  },
  screenTitle: {
    fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text,
  },
  headerSpacer: { width: 36 },

  // Amount
  amountSection: { alignItems: 'center', marginBottom: 22 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text2, marginBottom: 8,
  },
  amountBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
    gap: 2, alignSelf: 'stretch',
  },
  rupee: {
    fontFamily: fonts.syne, fontWeight: '800', color: colors.text2, flexShrink: 0,
  },
  amountInput: {
    fontFamily: fonts.syne, fontWeight: '800', color: colors.text,
    flex: 1, padding: 0, margin: 0, textAlign: 'center', minWidth: 0,
  },

  // Text inputs
  section: { marginBottom: 20 },
  inputBox: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 14,
    fontWeight: '500', color: colors.text, padding: 0, margin: 0,
  },
  inputError: { borderColor: colors.danger },
  fieldError: {
    fontFamily: fonts.dmSans, fontSize: 11, color: colors.danger,
    marginTop: 6, paddingLeft: 2,
  },

  // Category
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moreCatChip: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, paddingVertical: 7,
    borderRadius: 14, backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', minHeight: 36,
  },
  moreCatChipSelected: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  moreCatText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 11,
    fontWeight: '600', color: colors.text2, textAlign: 'center',
  },
  moreCatTextSelected: { color: colors.accent },

  // People
  peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitCalcRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
  },
  splitCalc: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 12,
    fontWeight: '500', color: colors.text2,
  },
  eachBadge: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  eachBadgeText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent,
  },

  // CTA
  cta: {
    backgroundColor: colors.accent, borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 16, elevation: 10,
  },
  ctaText: {
    fontFamily: fonts.syne, fontSize: 15, fontWeight: '800', color: '#000',
  },
});
