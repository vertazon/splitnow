import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';

interface ToastProps {
  message: string;
  visible: boolean;
}

export function ToastNotification({ message, visible }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 10, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 102 : 76,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 100,
    pointerEvents: 'none',
  },
  text: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
});
