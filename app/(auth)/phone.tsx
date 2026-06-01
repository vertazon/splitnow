import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { APP_NAME, PRIVACY_URL, TERMS_URL } from '@/constants/app';
import { sendEmailOtp } from '@/hooks/useAuth';
import { signInWithGoogle } from '@/lib/googleAuth';

export default function EmailScreen() {
  const router   = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [email, setEmail]     = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Basic email validation
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Google button is Android-only for now: offering Google login on iOS would
  // require Sign in with Apple too (App Store Guideline 4.8).
  const showGoogle = Platform.OS === 'android';

  const handleGoogle = async () => {
    if (googleLoading || loading) return;
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    // On success, onAuthStateChange (useAuthInit) drives navigation — nothing
    // to do here. A user cancellation is silent. Only surface real errors.
    if (!result.ok && !result.cancelled) {
      setError(result.error);
    }
  };

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

          {/* Google sign-in (Android only) */}
          {showGoogle && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.googleBtn, googleLoading && styles.ctaDim]}
                onPress={handleGoogle}
                activeOpacity={0.85}
                disabled={googleLoading || loading}
              >
                {googleLoading
                  ? <ActivityIndicator color={colors.text} />
                  : (
                    <>
                      <Ionicons name="logo-google" size={18} color={colors.text} />
                      <Text style={styles.googleText}>Continue with Google</Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </>
          )}

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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text3,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.borderEmphasis,
    borderRadius: 16,
    height: 54,
  },
  googleText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
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
