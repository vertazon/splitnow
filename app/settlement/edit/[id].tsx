import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { sanitizeAmountInput, isValidAmount, parseAmount } from '@/constants/amountUtils';
import { useSettlement, useUpdateSettlement } from '@/hooks/useSettlements';

export default function EditSettlementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: settlement, isLoading } = useSettlement(id);
  const updateSettlement = useUpdateSettlement();

  const [amount, setAmount] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [initialised, setInitialised] = useState(false);

  if (settlement && !initialised) {
    setAmount(String(settlement.amount));
    setUpiRef(settlement.upi_ref ?? '');
    setInitialised(true);
  }

  const canSave = isValidAmount(amount) && parseAmount(amount) > 0;

  const handleSave = () => {
    if (!settlement || !canSave) return;
    updateSettlement.mutate(
      {
        id: settlement.id,
        groupId: settlement.group_id,
        amount: parseAmount(amount),
        upiRef: upiRef.trim() || undefined,
      },
      { onSuccess: () => router.back() }
    );
  };

  if (isLoading || !settlement) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Settlement</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Settlement</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.rupeeSymbol}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={t => setAmount(sanitizeAmountInput(t))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.text3}
                selectionColor={colors.accent}
                autoFocus
              />
            </View>
          </View>

          {/* UPI Ref */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>UPI REFERENCE <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.textInput}
              value={upiRef}
              onChangeText={setUpiRef}
              placeholder="e.g. 123456789012"
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
              autoCapitalize="none"
            />
          </View>
        </ScrollView>

        {/* Save CTA */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || updateSettlement.isPending}
            activeOpacity={0.8}
          >
            {updateSettlement.isPending
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: fonts.syne, fontSize: 17, fontWeight: '800', color: colors.text,
  },

  scroll: { flex: 1 },
  content: { padding: 22, gap: 20 },

  field: { gap: 10 },
  fieldLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    color: colors.text2, letterSpacing: 1, textTransform: 'uppercase',
  },
  optional: {
    fontFamily: fonts.dmSans, fontSize: 10, color: colors.text3,
    textTransform: 'none', letterSpacing: 0,
  },

  amountInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5, borderColor: colors.borderEmphasis,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  rupeeSymbol: {
    fontFamily: fonts.syne, fontSize: 22, fontWeight: '800',
    color: colors.text2, marginRight: 6,
  },
  amountInput: {
    flex: 1, fontFamily: fonts.syne, fontSize: 28,
    fontWeight: '800', color: colors.text, padding: 0,
  },

  textInput: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5, borderColor: colors.borderEmphasis,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: fonts.dmSans, fontSize: 14, color: colors.text,
  },

  footer: { padding: 22, paddingTop: 12 },
  saveBtn: {
    height: 52, borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontFamily: fonts.syne, fontSize: 15, fontWeight: '800', color: '#000',
  },
});
