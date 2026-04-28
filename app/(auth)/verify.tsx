import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { sendOtp, verifyOtp } from '@/hooks/useAuth';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_SECONDS);

  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));

  // Countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  // Auto-focus first box on mount
  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const handleVerify = useCallback(async (code: string) => {
    if (!phone || loading) return;
    setError(null);
    setLoading(true);
    const { error: verifyError } = await verifyOtp(phone, code);
    setLoading(false);
    if (verifyError) {
      setError(verifyError);
      // Clear and refocus
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }
    // onAuthStateChange in useAuthInit will fire and populate the store.
    // AuthGuard in _layout.tsx will redirect based on whether name is set.
  }, [phone, loading]);

  const handleDigitChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    setError(null);

    if (digit && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every(d => d !== '')) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = '';
      setDigits(next);
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0 || !phone) return;
    setError(null);
    setDigits(Array(OTP_LENGTH).fill(''));
    setResendCountdown(RESEND_SECONDS);
    inputRefs.current[0]?.focus();
    await sendOtp(phone);
  };

  // Masked phone display: +91 98765 4****
  const maskedPhone = phone
    ? phone.replace(/(\+91)(\d{5})(\d{4})(\d{1})/, '$1 $2 ****')
    : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Back */}
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Heading */}
          <Text style={styles.title}>Enter OTP</Text>
          <View style={styles.subRow}>
            <Text style={styles.sub}>Sent to {maskedPhone}</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.changeBtn}> · Change</Text>
            </TouchableOpacity>
          </View>

          {/* OTP boxes */}
          <View style={styles.boxRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                style={[styles.box, d ? styles.boxFilled : null, error ? styles.boxError : null]}
                value={d}
                onChangeText={val => handleDigitChange(i, val)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                caretHidden
              />
            ))}
          </View>

          {/* Error */}
          {error && <Text style={styles.error}>{error}</Text>}

          {/* Resend */}
          <TouchableOpacity onPress={handleResend} disabled={resendCountdown > 0}>
            <Text style={[styles.resend, resendCountdown > 0 && styles.resendDim]}>
              {resendCountdown > 0
                ? `Resend OTP in ${resendCountdown}s`
                : 'Resend OTP'}
            </Text>
          </TouchableOpacity>

          {/* Verify CTA */}
          <TouchableOpacity
            style={[styles.cta, (digits.some(d => !d) || loading) && styles.ctaDim]}
            onPress={() => handleVerify(digits.join(''))}
            activeOpacity={0.85}
            disabled={digits.some(d => !d) || loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.ctaText}>Verify →</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BOX_SIZE = 48;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  back: { marginBottom: 32 },
  backText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    color: colors.text2,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 36 },
  sub: { fontFamily: fonts.dmSans, fontSize: 14, color: colors.text2 },
  changeBtn: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, color: colors.accent },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE + 8,
    borderRadius: 14,
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.border,
    textAlign: 'center',
    fontFamily: fonts.syne,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  boxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  boxError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerDim,
  },
  error: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  resend: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 32,
  },
  resendDim: { color: colors.text3 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
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
});
