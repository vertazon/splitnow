import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { sendOtp, toE164 } from '@/hooks/useAuth';

export default function PhoneScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [digits, setDigits] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isValid = digits.replace(/\D/g, '').length === 10;

  const handleSend = async () => {
    if (!isValid || loading) return;
    setError(null);
    setLoading(true);
    const phone = toE164(digits);
    const { error: otpError } = await sendOtp(phone);
    setLoading(false);
    if (otpError) {
      setError(otpError);
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { phone } } as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Text style={styles.logoMark}>💸</Text>
            <Text style={styles.logoText}>SplitNow</Text>
          </View>

          {/* Heading */}
          <Text style={styles.title}>Enter your number</Text>
          <Text style={styles.sub}>We'll send a 6-digit OTP to verify your identity.</Text>

          {/* Phone input */}
          <View style={styles.inputRow}>
            <View style={styles.countryChip}>
              <Text style={styles.flag}>🇮🇳</Text>
              <Text style={styles.code}>+91</Text>
            </View>
            <TextInput
              ref={inputRef}
              style={styles.phoneInput}
              value={digits}
              onChangeText={t => {
                setError(null);
                setDigits(t.replace(/\D/g, '').slice(0, 10));
              }}
              placeholder="98765 43210"
              placeholderTextColor={colors.text3}
              keyboardType="number-pad"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              maxLength={10}
              autoFocus
            />
          </View>

          {/* Error */}
          {error && <Text style={styles.error}>{error}</Text>}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.cta, (!isValid || loading) && styles.ctaDim]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={!isValid || loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.ctaText}>Send OTP →</Text>
            }
          </TouchableOpacity>

          {/* Legal */}
          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink}>Terms</Text> &{' '}
            <Text style={styles.legalLink}>Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  logoWrap: { alignItems: 'center', marginBottom: 56 },
  logoMark: { fontSize: 48, marginBottom: 8 },
  logoText: {
    fontFamily: fonts.syne,
    fontSize: 28,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  sub: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: colors.text2,
    lineHeight: 20,
    marginBottom: 32,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  flag: { fontSize: 18 },
  code: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.syne,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1.5,
  },
  error: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 12,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaDim: { opacity: 0.45 },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
  },
  legal: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text3,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
  legalLink: { color: colors.text2, textDecorationLine: 'underline' },
});
