import { StyleSheet } from 'react-native';
import { colors } from './colors';

// Single font family — Plus Jakarta Sans — across all weights.
// Property names kept stable so screen/component files need no changes.
export const fonts = {
  // 800 — display numbers, screen titles, CTA buttons
  syne: 'PlusJakartaSans_800ExtraBold',
  // 700 — section labels (UPPERCASE), bold UI labels
  bold: 'PlusJakartaSans_700Bold',
  // 600 — row titles, chip labels, body emphasis
  dmSansSemiBold: 'PlusJakartaSans_600SemiBold',
  // 500 — secondary body, split calculator text
  dmSansMedium: 'PlusJakartaSans_500Medium',
  // 400 — metadata, dates, placeholders
  dmSans: 'PlusJakartaSans_400Regular',
};

export const typography = StyleSheet.create({
  screenTitle: {
    fontFamily: fonts.syne,
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  balanceAmount: {
    fontFamily: fonts.syne,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  largeInput: {
    fontFamily: fonts.syne,
    fontSize: 52,
    fontWeight: '800',
    color: colors.text,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
  },
  rowTitle: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  metadata: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    fontWeight: '400',
    color: colors.text2,
  },
  chipLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  ctaButton: {
    fontFamily: fonts.bold,
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  numberMd: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
  },
  numberSm: {
    fontFamily: fonts.syne,
    fontSize: 14,
    fontWeight: '800',
  },
  statNumber: {
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
});
