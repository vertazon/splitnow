import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import type { Category } from '@/constants/sampleData';

interface CategoryChipProps {
  category: Category;
  selected: boolean;
  onPress: () => void;
  inline?: boolean;
  emojiOnly?: boolean;
  style?: ViewStyle;
}

export function CategoryChip({ category, selected, onPress, inline = false, emojiOnly = false, style }: CategoryChipProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (emojiOnly) {
    return (
      <Animated.View style={animStyle}>
        <TouchableOpacity
          style={[styles.squareChip, selected && styles.squareSelected]}
          onPress={onPress}
          onPressIn={() => { scale.value = withTiming(0.95, { duration: 120 }); }}
          onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
          activeOpacity={1}
        >
          <Text style={styles.squareEmoji}>{category.emoji}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (inline) {
    return (
      <Animated.View style={animStyle}>
        <TouchableOpacity
          style={[styles.inlineChip, selected && styles.inlineSelected]}
          onPress={onPress}
          onPressIn={() => { scale.value = withTiming(0.95, { duration: 120 }); }}
          onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
          activeOpacity={1}
        >
          <Text style={styles.inlineEmoji}>{category.emoji}</Text>
          <Text style={[styles.inlineLabel, selected && styles.inlineLabelSelected]}>
            {category.label}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[animStyle, style]}>
      <TouchableOpacity
        style={[styles.gridChip, selected && styles.gridSelected]}
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 120 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
        activeOpacity={1}
      >
        <Text style={styles.gridEmoji}>{category.emoji}</Text>
        <Text style={[styles.gridLabel, selected && styles.gridLabelSelected]}>
          {category.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  squareChip: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  squareSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  squareEmoji: {
    fontSize: 20,
  },

  inlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    minHeight: 36,
  },
  inlineSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  inlineEmoji: {
    fontSize: 14,
  },
  inlineLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  inlineLabelSelected: {
    color: colors.accent,
  },
  gridChip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    minHeight: 60,
    width: '100%',
  },
  gridSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  gridEmoji: {
    fontSize: 18,
  },
  gridLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '600',
    color: colors.text2,
  },
  gridLabelSelected: {
    color: colors.accent,
  },
});
