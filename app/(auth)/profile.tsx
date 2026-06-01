import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { saveProfile } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor } from '@/types/database';

const COLOR_OPTIONS: { id: AvatarColor; label: string }[] = [
  { id: 'green',  label: '🟢' },
  { id: 'blue',   label: '🔵' },
  { id: 'purple', label: '🟣' },
  { id: 'orange', label: '🟠' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  // Reactive value for rendering; handleSave reads from store state directly
  // to avoid stale closures on web where auth re-initializes after navigation.
  const currentUserId = useUserStore(s => s.currentUserId);

  const [name, setName]             = useState('');
  const [upiId, setUpiId]           = useState('');
  const [avatarColor, setAvatarColor] = useState<AvatarColor>('green');
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  // Pre-fill the name from Google profile metadata for new OAuth sign-ups, so
  // they don't retype what Google already knows. Only seeds an empty field, so
  // it never clobbers what the user is typing. Email-OTP users have no such
  // metadata and simply start blank.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const meta = data.user?.user_metadata ?? {};
      const googleName: string =
        meta.full_name ?? meta.name ?? meta.given_name ?? '';
      if (googleName) {
        setName(prev => (prev.trim() ? prev : googleName));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const isValid = name.trim().length >= 2;
  const av = avatarColors[avatarColor];
  const preview = name.trim() ? initials(name) : '?';

  const handleSave = async () => {
    if (!isValid || loading) return;

    // Read directly from store state — avoids stale closure on web where the
    // reactive hook value may lag behind the Supabase auth re-initialization.
    const userId = useUserStore.getState().currentUserId;
    if (!userId) {
      setError('Session not ready — please wait a moment and try again.');
      return;
    }

    setError(null);
    setLoading(true);
    const { error: saveError } = await saveProfile(userId, {
      name: name.trim(),
      avatarColor,
      upiId: upiId.trim() || undefined,
    });
    setLoading(false);
    if (saveError) {
      setError(saveError);
    }
    // On success, saveProfile updates useUserStore → AuthGuard redirects to tabs.
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
          {/* Heading */}
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.sub}>This is how your friends will see you in the app.</Text>

          {/* Avatar preview */}
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: av.bg }]}>
              <Text style={[styles.avatarText, { color: av.text }]}>{preview}</Text>
            </View>
          </View>

          {/* Name */}
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={t => { setName(t); setError(null); }}
            placeholder="e.g. Aryan Sharma"
            placeholderTextColor={colors.text3}
            autoCapitalize="words"
            returnKeyType="done"
            maxLength={40}
          />

          {/* Colour */}
          <Text style={[styles.label, { marginTop: 24 }]}>PICK A COLOUR</Text>
          <View style={styles.colorRow}>
            {COLOR_OPTIONS.map(opt => {
              const ov = avatarColors[opt.id];
              const selected = avatarColor === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setAvatarColor(opt.id)}
                  style={[
                    styles.colorChip,
                    { backgroundColor: ov.bg, borderColor: selected ? ov.text : colors.border },
                    selected && styles.colorChipSelected,
                  ]}
                  activeOpacity={0.75}
                >
                  <View style={[styles.colorDot, { backgroundColor: ov.text }]} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* UPI ID (optional) */}
          <Text style={[styles.label, { marginTop: 24 }]}>UPI ID (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            value={upiId}
            onChangeText={setUpiId}
            placeholder="yourname@okaxis"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="done"
          />
          <Text style={styles.upiHint}>Used for the "Pay UPI" button in Settle Up.</Text>

          {/* Error */}
          {error && <Text style={styles.error}>{error}</Text>}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.cta, (!isValid || loading) && styles.ctaDim]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={!isValid || loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.ctaText}>Let's go →</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 40,
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 26,
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
  avatarWrap: { alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.syne,
    fontSize: 28,
    fontWeight: '800',
  },
  label: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: colors.borderEmphasis,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 16,
    color: colors.text,
  },
  colorRow: { flexDirection: 'row', gap: 12 },
  colorChip: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChipSelected: { borderWidth: 2.5 },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
  upiHint: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text3,
    marginTop: 6,
  },
  error: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.danger,
    marginTop: 12,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
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
