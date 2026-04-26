import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';

type AvatarColor = keyof typeof avatarColors;

interface PersonChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  initials?: string;
  avatarColor?: AvatarColor;
}

export function PersonChip({ label, selected, onPress, initials, avatarColor = 'blue' }: PersonChipProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const av = avatarColors[avatarColor];

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 120 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
        activeOpacity={1}
      >
        {initials ? (
          <View style={[styles.avatar, { backgroundColor: selected ? av.bg : 'rgba(255,255,255,0.07)' }]}>
            <Text style={[styles.avatarText, { color: selected ? av.text : colors.text2 }]}>
              {initials}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 8,
    paddingRight: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    minHeight: 36,
  },
  chipSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMid,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 8,
    fontWeight: '700',
  },
  label: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  labelSelected: {
    color: colors.accent,
  },
});
