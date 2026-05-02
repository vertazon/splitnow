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
import { useAddExpense } from '@/hooks/useExpenses';
import type { AvatarColor } from '@/types/database';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function amountFontSize(len: number) {
  if (len > 8) return 26;
  if (len > 6) return 32;
  if (len > 4) return 40;
  return 48;
}

export default function AddScreen() {
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const { data: members = [] } = useMembers(groupId);
  const addExpense = useAddExpense();
  const { width } = useWindowDimensions();
  const chipWidth = (width - 44 - 16) / 3;

  // Everyone in the group except the current user (they are always the payer/participant)
  const splitPeople = members.filter(m => m.id !== currentUserId);

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCatId, setSelectedCatId] = useState(categories[0].id);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [amountError, setAmountError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);

  // Default: pre-select first two non-current members so the strip isn't empty
  // Run only when members first arrive AND no selection has been made yet.
  const didDefault = useRef(false);
  useEffect(() => {
    if (didDefault.current) return;
    if (splitPeople.length === 0) return;
    setSelectedPeople(new Set(splitPeople.slice(0, 2).map(m => m.id)));
    didDefault.current = true;
  }, [splitPeople]);

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
  const splitCount = selectedPeople.size + 1;
  const each = parsedAmount > 0 ? parseFloat((parsedAmount / splitCount).toFixed(2)) : 0;
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
    setSelectedPeople(new Set(splitPeople.slice(0, 2).map(m => m.id)));
    setAmountError('');
    setTitleError('');
  }, [splitPeople]);

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
    if (hasError) return;

    ctaScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 120 })
    );

    const splitWith = [currentUserId, ...Array.from(selectedPeople)];

    addExpense.mutate(
      {
        groupId,
        title: title.trim(),
        amount: parsedAmount,
        category: selectedCatId,
        paidBy: currentUserId,
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
  }, [normalizedAmount, parsedAmount, title, selectedCatId, selectedPeople, groupId, currentUserId, addExpense, showToast, resetForm, router, ctaScale]);

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

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.catGrid}>
            {categories.slice(0, 9).map((cat) => (
              <CategoryChip
                key={cat.id}
                category={cat}
                selected={selectedCatId === cat.id}
                onPress={() => setSelectedCatId(cat.id)}
                style={{ width: chipWidth }}
              />
            ))}
            {(() => {
              const isMoreSel = !categories.slice(0, 9).find(c => c.id === selectedCatId);
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

        {/* Split With */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SPLIT WITH</Text>
          <View style={styles.peopleRow}>
            {splitPeople.map(m => (
              <PersonChip
                key={m.id}
                label={m.name ?? '?'}
                selected={selectedPeople.has(m.id)}
                onPress={() => togglePerson(m.id)}
                initials={initialsFromName(m.name)}
                avatarColor={(m.avatar_color ?? 'green') as AvatarColor}
              />
            ))}
          </View>
          <Text style={styles.splitCalc}>{splitText}</Text>
        </View>

        {/* CTA */}
        <AnimatedTouchable
          style={[styles.cta, ctaStyle, addExpense.isPending && { opacity: 0.7 }]}
          onPress={handleAdd}
          activeOpacity={0.85}
          disabled={addExpense.isPending}
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
});
