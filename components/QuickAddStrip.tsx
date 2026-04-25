import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';

interface QuickAddStripProps {
  onAdd: (amount: string) => void;
}

export function QuickAddStrip({ onAdd }: QuickAddStripProps) {
  const [amount, setAmount] = useState('540');
  const [catIdx, setCatIdx] = useState(0);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(
    new Set(['Raj', 'Priya'])
  );
  const dotOpacity = useSharedValue(1);
  const dotScale = useSharedValue(1);
  const plusScale = useSharedValue(1);

  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withDelay(900, withTiming(0.4, { duration: 500 })),
        withDelay(0, withTiming(1, { duration: 500 }))
      ),
      -1,
      false
    );
    dotScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withDelay(900, withTiming(0.7, { duration: 500 })),
        withDelay(0, withTiming(1, { duration: 500 }))
      ),
      -1,
      false
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: plusScale.value }],
  }));

  const togglePerson = (name: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAdd = () => {
    plusScale.value = withSequence(
      withTiming(0.88, { duration: 100 }),
      withTiming(1, { duration: 120 })
    );
    onAdd(amount || '540');
  };

  const people = ['Raj', 'Priya', 'Arjun'];

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>QUICK ADD</Text>
        <Animated.View style={[styles.pulseDot, dotStyle]} />
      </View>

      <View style={styles.card}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripRow}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.amountBox}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
            />
          </View>

          <TouchableOpacity
            style={[styles.chip, styles.chipSelected]}
            onPress={() => setCatIdx((catIdx + 1) % categories.length)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipTextSelected}>
              {categories[catIdx].emoji} {categories[catIdx].label}
            </Text>
          </TouchableOpacity>

          {people.map(name => {
            const sel = selectedPeople.has(name);
            return (
              <TouchableOpacity
                key={name}
                style={[styles.chip, sel && styles.chipSelected]}
                onPress={() => togglePerson(name)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, sel && styles.chipTextSelected]}>
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}

          <Animated.View style={plusStyle}>
            <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </View>

      <Text style={styles.hint}>Last: 🍛 Food</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 5,
  },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: 'hidden',
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    flexShrink: 0,
  },
  rupee: {
    fontFamily: fonts.syne,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text2,
  },
  amountInput: {
    fontFamily: fonts.syne,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    width: 62,
    padding: 0,
    margin: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    minHeight: 36,
    flexShrink: 0,
  },
  chipSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  chipText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    flexShrink: 0,
  },
  addBtnText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
    lineHeight: 26,
  },
  hint: {
    fontFamily: fonts.dmSans,
    fontSize: 10,
    color: colors.text3,
    marginTop: 5,
    paddingLeft: 2,
  },
});
