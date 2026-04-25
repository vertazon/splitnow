import { useState, useRef, useCallback } from 'react';
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
import { categories, members } from '@/constants/sampleData';
import type { Expense } from '@/constants/sampleData';
import { useAppContext } from '@/context/AppContext';
import { CategoryChip } from '@/components/CategoryChip';
import { PersonChip } from '@/components/PersonChip';
import { ToastNotification } from '@/components/ToastNotification';

const splitPeople = members.filter(m => m.id !== 'aryan');
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Steps: ≤4 digits → 48, 5–6 → 40, 7–8 → 32, 9+ → 26
function amountFontSize(len: number) {
  if (len > 8) return 26;
  if (len > 6) return 32;
  if (len > 4) return 40;
  return 48;
}

export default function AddScreen() {
  const router = useRouter();
  const { addExpense } = useAppContext();
  const { width } = useWindowDimensions();
  // 3-column grid: (screenWidth - 44 screen padding - 16 two gaps) / 3
  const chipWidth = (width - 44 - 16) / 3;
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCat, setSelectedCat] = useState(0);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(
    new Set(['raj', 'priya'])
  );
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaScale = useSharedValue(1);

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

  const parsedAmount = parseInt(amount) || 0;
  const fontSize = amountFontSize(amount.length);
  const splitCount = selectedPeople.size + 1;
  const each = parsedAmount > 0 ? Math.round(parsedAmount / splitCount) : 0;
  const splitText = each > 0
    ? `Each pays ₹${each.toLocaleString('en-IN')} (${splitCount} people)`
    : `Split with ${splitCount} people`;

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const resetForm = useCallback(() => {
    setAmount('');
    setTitle('');
    setSelectedCat(0);
    setSelectedPeople(new Set(['raj', 'priya']));
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    router.navigate('/');
  }, [resetForm, router]);

  const handleAdd = useCallback(() => {
    if (parsedAmount <= 0) {
      showToast('Enter an amount first');
      return;
    }

    ctaScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 120 })
    );

    const cat = categories[selectedCat];
    const peopleNames = splitPeople
      .filter(m => selectedPeople.has(m.id))
      .map(m => m.name);

    const newExpense: Expense = {
      id: Date.now().toString(),
      emoji: cat.emoji,
      title: title.trim() || cat.label,
      amount: parsedAmount,
      date: 'Just now',
      people: peopleNames.length > 0 ? peopleNames.join(', ') : undefined,
    };

    addExpense(newExpense);
    showToast(`✓ ₹${parsedAmount.toLocaleString('en-IN')} added!`);
    resetForm();
  }, [parsedAmount, title, selectedCat, selectedPeople, addExpense, showToast, resetForm]);

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
              onChangeText={setAmount}
              keyboardType="numeric"
              autoFocus
              selectionColor={colors.accent}
              placeholderTextColor={colors.text3}
              placeholder="0"
            />
          </View>
        </View>

        {/* Title / Note */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TITLE</Text>
          <View style={styles.noteBox}>
            <TextInput
              style={styles.noteInput}
              value={title}
              onChangeText={setTitle}
              placeholder="What's this for? (optional)"
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
              returnKeyType="done"
              maxLength={60}
            />
          </View>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.catGrid}>
            {categories.map((cat, i) => (
              <CategoryChip
                key={cat.id}
                category={cat}
                selected={selectedCat === i}
                onPress={() => setSelectedCat(i)}
                style={{ width: chipWidth }}
              />
            ))}
          </View>
        </View>

        {/* Split With */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SPLIT WITH</Text>
          <View style={styles.peopleRow}>
            {splitPeople.map(m => (
              <PersonChip
                key={m.id}
                label={m.name}
                selected={selectedPeople.has(m.id)}
                onPress={() => togglePerson(m.id)}
              />
            ))}
          </View>
          <Text style={styles.splitCalc}>{splitText}</Text>
        </View>

        {/* CTA */}
        <AnimatedTouchable
          style={[styles.cta, ctaStyle]}
          onPress={handleAdd}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Add Expense →</Text>
        </AnimatedTouchable>
      </ScrollView>

      <ToastNotification message={toast} visible={toastVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
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
  amountSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
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
  section: {
    marginBottom: 20,
  },
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
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  peopleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
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
