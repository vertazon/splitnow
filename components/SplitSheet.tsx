import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import type { User, AvatarColor } from '@/types/database';

export type SplitMode = 'equal' | 'amount' | 'percentage';

interface SplitSheetProps {
  visible: boolean;
  onClose: () => void;
  members: User[];        // only the selected members
  totalAmount: number;
  mode: SplitMode;
  splits: Record<string, string>; // userId → raw input string
  currentUserId: string;
  onConfirm: (mode: SplitMode, splits: Record<string, string>) => void;
}

const TABS: { id: SplitMode; label: string }[] = [
  { id: 'equal',      label: 'Equal'   },
  { id: 'amount',     label: 'Amount'  },
  { id: 'percentage', label: '%'       },
];

export function SplitSheet({
  visible, onClose, members, totalAmount, mode: initMode,
  splits: initSplits, currentUserId, onConfirm,
}: SplitSheetProps) {
  const [mode, setMode]     = useState<SplitMode>(initMode);
  const [splits, setSplits] = useState<Record<string, string>>(initSplits);

  // Sync when sheet reopens
  useEffect(() => {
    if (visible) { setMode(initMode); setSplits(initSplits); }
  }, [visible]); // eslint-disable-line

  const n        = Math.max(1, members.length);
  const equalAmt = parseFloat((totalAmount / n).toFixed(2));
  const equalPct = parseFloat((100 / n).toFixed(2));

  const defaultVal = (m: SplitMode) =>
    m === 'percentage' ? String(equalPct) : String(equalAmt);

  const getVal = (uid: string) => splits[uid] ?? defaultVal(mode);

  const setVal = (uid: string, v: string) =>
    setSplits(prev => ({ ...prev, [uid]: v }));

  const switchMode = (m: SplitMode) => {
    const dv = defaultVal(m);
    const defaults: Record<string, string> = {};
    members.forEach(mem => { defaults[mem.id] = dv; });
    setMode(m);
    setSplits(m === 'equal' ? {} : defaults);
  };

  // Validation
  const sum    = members.reduce((s, m) => s + (parseFloat(getVal(m.id)) || 0), 0);
  const amtOk  = mode !== 'amount'     || Math.abs(sum - totalAmount) < 0.02;
  const pctOk  = mode !== 'percentage' || Math.abs(sum - 100) < 0.02;
  const valid  = amtOk && pctOk;

  const handleDone = () => {
    if (!valid) return;
    onConfirm(mode, mode === 'equal' ? {} : { ...splits });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.kv}
        >
          <View style={s.container}>
            <View style={s.handle} />

            {/* Header */}
            <View style={s.header}>
              <Text style={s.title}>Split {formatAmount(totalAmount)}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Mode tabs */}
            <View style={s.tabs}>
              {TABS.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.tab, mode === t.id && s.tabOn]}
                  onPress={() => switchMode(t.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.tabText, mode === t.id && s.tabTextOn]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Member rows */}
            <ScrollView
              style={s.list}
              contentContainerStyle={s.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {members.map((m, i) => {
                const av = avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;
                return (
                  <View key={m.id}>
                    <View style={s.row}>
                      <View style={[s.avatar, { backgroundColor: av.bg }]}>
                        <Text style={[s.avatarText, { color: av.text }]}>
                          {initialsFromName(m.name)}
                        </Text>
                      </View>
                      <Text style={s.rowName}>
                        {m.id === currentUserId ? 'You' : (m.name ?? '?')}
                      </Text>
                      {mode === 'equal' ? (
                        <Text style={s.equalAmt}>{formatAmount(equalAmt)}</Text>
                      ) : (
                        <View style={s.inputWrap}>
                          <Text style={s.inputPrefix}>
                            {mode === 'percentage' ? '%' : '₹'}
                          </Text>
                          <TextInput
                            style={s.input}
                            value={getVal(m.id)}
                            onChangeText={v => setVal(m.id, v)}
                            keyboardType="decimal-pad"
                            selectionColor={colors.accent}
                            placeholderTextColor={colors.text3}
                          />
                        </View>
                      )}
                    </View>
                    {i < members.length - 1 && <View style={s.divider} />}
                  </View>
                );
              })}
            </ScrollView>

            {/* Summary strip */}
            {mode !== 'equal' && (
              <View style={[s.summary, !valid && s.summaryBad]}>
                <Text style={[s.summaryText, !valid && { color: colors.danger }]}>
                  {mode === 'amount'
                    ? `${formatAmount(sum)} of ${formatAmount(totalAmount)}`
                    : `${sum.toFixed(1)}% of 100%`}
                </Text>
                {!valid && (
                  <Text style={s.summaryErr}>
                    {mode === 'amount'
                      ? 'Must add up to total amount'
                      : 'Must add up to 100%'}
                  </Text>
                )}
              </View>
            )}

            {/* Confirm */}
            <TouchableOpacity
              style={[s.done, !valid && s.doneDisabled]}
              onPress={handleDone}
              activeOpacity={0.85}
            >
              <Text style={s.doneText}>Confirm split</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  kv:      { justifyContent: 'flex-end' },
  container: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 20,
    height: '92%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 18,
  },
  title:    { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text },
  closeBtn: { fontFamily: fonts.dmSans, fontSize: 16, color: colors.text2 },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: 12, backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  tabOn:     { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  tabText:   { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text2 },
  tabTextOn: { color: colors.accent },

  list:        { flex: 1 },
  listContent: { paddingBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, gap: 12,
  },
  divider: { height: 1, backgroundColor: colors.border },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  rowName: {
    flex: 1, fontFamily: fonts.dmSansSemiBold,
    fontSize: 14, fontWeight: '600', color: colors.text,
  },
  equalAmt: {
    fontFamily: fonts.syne, fontSize: 15, fontWeight: '800',
    color: colors.accent, minWidth: 72, textAlign: 'right',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5, borderColor: colors.borderEmphasis,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
    minWidth: 96,
  },
  inputPrefix: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 13,
    color: colors.text2, marginRight: 4,
  },
  input: {
    fontFamily: fonts.syne, fontSize: 15, fontWeight: '800',
    color: colors.text, padding: 0, flex: 1, minWidth: 48,
  },

  summary: {
    backgroundColor: colors.cardElevated,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 16, marginBottom: 12,
  },
  summaryBad: {
    borderColor: 'rgba(255,89,89,0.35)', backgroundColor: colors.dangerDim,
  },
  summaryText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text,
  },
  summaryErr: {
    fontFamily: fonts.dmSans, fontSize: 11, color: colors.danger, marginTop: 3,
  },

  done: {
    backgroundColor: colors.accent, borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  doneDisabled: { opacity: 0.35 },
  doneText: { fontFamily: fonts.syne, fontSize: 15, fontWeight: '800', color: '#000' },
});
