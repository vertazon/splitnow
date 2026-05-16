import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type PrefKey = 'expense_added' | 'expense_edited' | 'settlement_received' | 'comment_added';

interface Prefs {
  expense_added:       boolean;
  expense_edited:      boolean;
  settlement_received: boolean;
  comment_added:       boolean;
}

const DEFAULT_PREFS: Prefs = {
  expense_added:       true,
  expense_edited:      true,
  settlement_received: true,
  comment_added:       true,
};

const PREF_LABELS: Array<{ key: PrefKey; label: string; sub: string }> = [
  { key: 'expense_added',       label: 'New expenses',        sub: 'When a group member logs an expense' },
  { key: 'expense_edited',      label: 'Expense edits',       sub: 'When an expense you\'re part of changes' },
  { key: 'settlement_received', label: 'Settlements',         sub: 'When someone settles up with you' },
  { key: 'comment_added',       label: 'Comments',            sub: 'When someone comments on an expense' },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const router        = useRouter();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const [prefs, setPrefs]       = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch current prefs on mount
  useEffect(() => {
    supabase
      .from('users')
      .select('notification_prefs')
      .eq('id', currentUserId)
      .single()
      .then(({ data }) => {
        if (data?.notification_prefs) {
          setPrefs({ ...DEFAULT_PREFS, ...(data.notification_prefs as Prefs) });
        }
        setLoading(false);
      });
  }, [currentUserId]);

  // Debounced save — fires 600ms after the last toggle
  const savePrefs = useCallback((next: Prefs) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await supabase
        .from('users')
        .update({ notification_prefs: next })
        .eq('id', currentUserId);
      setSaving(false);
    }, 600);
  }, [currentUserId]);

  const toggle = useCallback((key: PrefKey) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      savePrefs(next);
      return next;
    });
  }, [savePrefs]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.headerRight}>
          {saving && <ActivityIndicator size="small" color={colors.text3} />}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>NOTIFY ME WHEN</Text>
            <View style={styles.card}>
              {PREF_LABELS.map((item, i) => (
                <View key={item.key}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text style={styles.rowSub}>{item.sub}</Text>
                    </View>
                    <Switch
                      value={prefs[item.key]}
                      onValueChange={() => toggle(item.key)}
                      trackColor={{ false: colors.cardElevated, true: colors.accentMid }}
                      thumbColor={prefs[item.key] ? colors.accent : colors.text3}
                      ios_backgroundColor={colors.cardElevated}
                    />
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.hint}>
              Push notifications are sent to your device when others act on shared expenses.
              Changes save automatically.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.syne,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  headerRight: { width: 36, alignItems: 'center' },

  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 10,
    marginTop: 16,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  rowText: { flex: 1, gap: 3 },
  rowLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowSub: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text3,
  },

  hint: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text3,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
