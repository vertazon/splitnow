import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { APP_NAME, PRIVACY_URL, TERMS_URL } from '@/constants/app';
import { sendEmailOtp } from '@/hooks/useAuth';

export default function EmailScreen() {
  const router   = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [email, setEmail]     = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Basic email validation
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSend = async () => {
    if (!isValid || loading) return;
    setError(null);
    setLoading(true);
    const { error: otpError } = await sendEmailOtp(email.trim().toLowerCase());
    setLoading(false);
    if (otpError) {
      setError(otpError);
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } } as never);
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
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logoMark}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>{APP_NAME}</Text>
          </View>

          {/* Heading */}
          <Text style={styles.title}>Enter your email</Text>
          <Text style={styles.sub}>We'll send a 6-digit OTP to verify your identity.</Text>

          {/* Email input */}
          <TextInput
            ref={inputRef}
            style={[styles.emailInput, error ? styles.emailInputError : null]}
            value={email}
            onChangeText={t => { setError(null); setEmail(t); }}
            placeholder="you@example.com"
            placeholderTextColor={colors.text3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            autoFocus
          />

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
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms</Text>
            {' '}&{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>.
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
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 12,
  },
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
    marginBottom: 24,
  },
  emailInput: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.borderEmphasis,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  emailInputError: {
    borderColor: colors.danger,
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
    marginTop: 4,
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
