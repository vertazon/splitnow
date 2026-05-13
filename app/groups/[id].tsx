import type { MemberLite } from '@/components/ActivityRow';
import { ActivityRow, SettlementRow } from '@/components/ActivityRow';
import { BalanceRow } from '@/components/BalanceCard';
import { CategoryChip } from '@/components/CategoryChip';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { SplitMode, SplitSheet } from '@/components/SplitSheet';
import { ToastNotification } from '@/components/ToastNotification';
import {
  formatAmount,
  isValidAmount,
  parseAmount,
  sanitizeAmountInput,
} from '@/constants/amountUtils';
import { avatarColors, colors } from '@/constants/colors';
import { initialsFromName } from '@/constants/dateFormat';
import { categories } from '@/constants/sampleData';
import { fonts } from '@/constants/typography';
import { useBalances, useNetBalance } from '@/hooks/useBalances';
import { useNavGuard } from '@/hooks/useNavGuard';
import { useAddExpense, useExpenses } from '@/hooks/useExpenses';
import { useGroupDetail, useGroupMembers } from '@/hooks/useGroups';
import { useSettleUp, useSettlements } from '@/hooks/useSettlements';
import { DEV_USER_ID } from '@/lib/auth';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor, Balance } from '@/types/database';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function amountFontSize(len: number) {
  if (len > 8) return 22;
  if (len > 6) return 28;
  if (len > 4) return 34;
  return 42;
}

// ─── Add Expense Sheet ────────────────────────────────────────────────────────

interface AddSheetProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  groupEmoji: string;
  currentUserId: string;
  currentUserName: string | null;
  currentUserColor: AvatarColor;
  members: ReturnType<typeof useGroupMembers>['data'];
  onSuccess: (msg: string) => void;
}

function AddExpenseSheet({
  visible,
  onClose,
  groupId,
  groupName,
  groupEmoji,
  currentUserId,
  currentUserName,
  currentUserColor,
  members = [],
  onSuccess,
}: AddSheetProps) {
  const addExpense = useAddExpense();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight;

  // Animation
  const sheetY    = useSharedValue(sheetHeight);
  const overlayOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOp.value = withTiming(1, { duration: 220 });
      sheetY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
  }, [visible]);

  const closeSheet = useCallback(() => {
    overlayOp.value = withTiming(0, { duration: 200 });
    sheetY.value = withTiming(sheetHeight, { duration: 260, easing: Easing.in(Easing.cubic) });
    setTimeout(onClose, 270);
  }, [onClose, overlayOp, sheetY, sheetHeight]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const sheetStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));

  // Form state
  const [amount, setAmount]           = useState('');
  const [title, setTitle]             = useState('');
  const [selectedCatId, setSelectedCatId] = useState(categories[0].id);
  const [paidBy, setPaidBy]           = useState(currentUserId);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode]     = useState<SplitMode>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [paidBySheetOpen, setPaidBySheetOpen] = useState(false);
  const [amountError, setAmountError] = useState('');
  const [titleError, setTitleError]   = useState('');
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [ctaState, setCtaState]       = useState<'idle' | 'success' | 'error'>('idle');

  const ctaScale   = useSharedValue(1);
  const amountShake = useSharedValue(0);

  const ctaAnimStyle   = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));
  const amountShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: amountShake.value }] }));

  const allMembers = members ?? [];
  const userInitials = currentUserName ? initialsFromName(currentUserName) : 'ME';

  useEffect(() => {
    setSelectedPeople(new Set(allMembers.map(m => m.userId)));
  }, [members?.length]);

  const resetForm = useCallback(() => {
    setAmount(''); setTitle('');
    setSelectedCatId(categories[0].id);
    setPaidBy(currentUserId);
    setSelectedPeople(new Set(allMembers.map(m => m.userId)));
    setSplitMode('equal'); setCustomSplits({});
    setAmountError(''); setTitleError('');
    setCtaState('idle');
  }, [currentUserId, allMembers]);

  const handleClose = useCallback(() => { resetForm(); closeSheet(); }, [resetForm, closeSheet]);

  const togglePerson = (id: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (splitMode !== 'equal') { setSplitMode('equal'); setCustomSplits({}); }
  };

  const normalised = amount.endsWith('.') ? amount.slice(0, -1) : amount;
  const parsedAmount = parseAmount(normalised);
  const fontSize   = amountFontSize(amount.length);
  const splitCount = selectedPeople.size;
  const each = parsedAmount > 0 && splitCount > 0 ? parseFloat((parsedAmount / splitCount).toFixed(2)) : 0;

  const resolveCustomSplits = (): Record<string, number> | undefined => {
    if (splitMode === 'equal') return undefined;
    const result: Record<string, number> = {};
    Array.from(selectedPeople).forEach(uid => {
      const raw = parseFloat(customSplits[uid] ?? '0') || 0;
      result[uid] = splitMode === 'percentage'
        ? parseFloat(((raw / 100) * parsedAmount).toFixed(2))
        : raw;
    });
    return result;
  };

  const handleAdd = useCallback(() => {
    let hasError = false;
    if (!isValidAmount(normalised)) {
      setAmountError('Enter a valid amount');
      amountShake.value = withSequence(
        withTiming(-8, { duration: 50 }), withTiming(8,  { duration: 50 }),
        withTiming(-6, { duration: 50 }), withTiming(6,  { duration: 50 }),
        withTiming(0,  { duration: 50 }),
      );
      hasError = true;
    }
    if (!title.trim()) { setTitleError('Title is required'); hasError = true; }
    if (selectedPeople.size === 0) { onSuccess('Select at least one person to split with'); return; }
    if (hasError) return;

    ctaScale.value = withSequence(withTiming(0.97, { duration: 100 }), withTiming(1, { duration: 120 }));

    addExpense.mutate(
      {
        groupId,
        title: title.trim(),
        amount: parsedAmount,
        category: selectedCatId,
        paidBy,
        addedBy: currentUserId,
        splitWith: Array.from(selectedPeople),
        customSplits: resolveCustomSplits(),
      },
      {
        onSuccess: () => {
          setCtaState('success');
          onSuccess(`✓ ${formatAmount(parsedAmount)} added!`);
          setTimeout(() => { resetForm(); closeSheet(); }, 900);
        },
        onError: (err: any) => {
          setCtaState('error');
          onSuccess(`Couldn't save: ${err?.message ?? 'try again'}`);
          setTimeout(() => setCtaState('idle'), 2000);
        },
      },
    );
  }, [normalised, parsedAmount, title, selectedCatId, paidBy, selectedPeople, groupId, currentUserId, addExpense, onSuccess, resetForm, closeSheet, ctaScale, amountShake]);

  const isMoreSel = !categories.slice(0, 8).find(c => c.id === selectedCatId);
  const moreCat   = isMoreSel ? categories.find(c => c.id === selectedCatId) : null;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[StyleSheet.absoluteFill, sheetStyles.overlay, overlayStyle]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[sheetStyles.sheet, { height: sheetHeight, paddingTop: insets.top }, sheetStyle]}>

        {/* Header */}
        <View style={sheetStyles.sheetHeader}>
          <View style={sheetStyles.groupBadge}>
            <Text style={sheetStyles.groupBadgeText}>{groupEmoji} {groupName}</Text>
          </View>
          <Text style={sheetStyles.sheetTitle}>Add Expense</Text>
          <TouchableOpacity style={sheetStyles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colors.text2} />
          </TouchableOpacity>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={sheetStyles.scroll}
          contentContainerStyle={sheetStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Amount — hero */}
          <Animated.View style={[sheetStyles.amountSection, amountShakeStyle]}>
            <View style={sheetStyles.amountRow}>
              <Text style={[sheetStyles.rupee, { fontSize: fontSize * 0.7, lineHeight: fontSize * 1.15 }]}>₹</Text>
              <TextInput
                style={[sheetStyles.amountInput, { fontSize }]}
                value={amount}
                onChangeText={t => { setAmount(sanitizeAmountInput(t)); if (amountError) setAmountError(''); }}
                keyboardType="decimal-pad"
                autoFocus
                selectionColor={colors.accent}
                placeholderTextColor={colors.text3}
                placeholder="0"
              />
            </View>
            {!!amountError && <Text style={sheetStyles.fieldErrorCenter}>{amountError}</Text>}
          </Animated.View>

          {/* Title — bare centered subtitle */}
          <View style={sheetStyles.titleSection}>
            <TextInput
              style={[sheetStyles.titleInput, !!titleError && sheetStyles.titleInputError]}
              value={title}
              onChangeText={t => { setTitle(t); if (titleError) setTitleError(''); }}
              placeholder="What's this for?"
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
              returnKeyType="done"
              maxLength={60}
              textAlign="center"
            />
            {!!titleError && <Text style={sheetStyles.fieldErrorCenter}>{titleError}</Text>}
          </View>

          {/* Details card */}
          <View style={sheetStyles.detailsCard}>

            {/* Category */}
            <View style={sheetStyles.cardRow}>
              <Text style={sheetStyles.cardRowLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sheetStyles.hChipsContent}>
                {categories.slice(0, 8).map(cat => (
                  <CategoryChip
                    key={cat.id}
                    category={cat}
                    selected={selectedCatId === cat.id}
                    onPress={() => setSelectedCatId(cat.id)}
                    emojiOnly
                  />
                ))}
                <TouchableOpacity
                  style={[sheetStyles.moreCatChip, isMoreSel && sheetStyles.moreCatChipSelected]}
                  onPress={() => setCatPickerOpen(true)}
                >
                  <Text style={[sheetStyles.moreCatText, isMoreSel && sheetStyles.moreCatTextSelected]}>
                    {moreCat ? `${moreCat.emoji} ${moreCat.label}` : 'More +'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              {(() => {
                const sel = categories.find(c => c.id === selectedCatId);
                return sel ? <Text style={sheetStyles.catSelectedLabel}>{sel.emoji}  {sel.label}</Text> : null;
              })()}
            </View>

            {/* Paid By */}
            {allMembers.length > 0 && (() => {
              const payer = allMembers.find(m => m.userId === paidBy) ?? allMembers[0];
              const av = avatarColors[payer.avatarColor] ?? avatarColors.green;
              return (
                <>
                  <View style={sheetStyles.cardDivider} />
                  <TouchableOpacity style={sheetStyles.paidByRow} onPress={() => setPaidBySheetOpen(true)} activeOpacity={0.7}>
                    <Text style={sheetStyles.cardRowLabel}>PAID BY</Text>
                    <View style={sheetStyles.paidByRight}>
                      <View style={[sheetStyles.paidByAvatar, { backgroundColor: av.bg }]}>
                        <Text style={[sheetStyles.paidByAvatarText, { color: av.text }]}>
                          {payer.userId === currentUserId ? userInitials : payer.initials}
                        </Text>
                      </View>
                      <Text style={sheetStyles.paidByName}>{payer.userId === currentUserId ? 'You' : payer.name}</Text>
                      <Text style={sheetStyles.paidByChevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                </>
              );
            })()}

            {/* Split With */}
            <View style={sheetStyles.cardDivider} />
            <View style={sheetStyles.cardRow}>
              <View style={sheetStyles.splitWithHeader}>
                <Text style={sheetStyles.cardRowLabel}>SPLIT WITH</Text>
                <TouchableOpacity
                  style={[sheetStyles.splitPill, splitMode !== 'equal' && sheetStyles.splitPillActive]}
                  onPress={() => setSplitSheetOpen(true)}
                  activeOpacity={0.7}
                  disabled={selectedPeople.size === 0}
                >
                  <Text style={[sheetStyles.splitPillText, splitMode !== 'equal' && sheetStyles.splitPillTextActive]}>
                    {splitMode === 'equal' ? '= Equal' : splitMode === 'amount' ? '≠ Amount' : '≠ %'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={sheetStyles.avatarCircleRow}>
                {allMembers.map(m => {
                  const av = avatarColors[m.avatarColor] ?? avatarColors.green;
                  const selected = selectedPeople.has(m.userId);
                  const splitAmt = selected
                    ? splitMode === 'equal' ? each
                      : splitMode === 'percentage'
                        ? parseFloat(((parseFloat(customSplits[m.userId] ?? '0') / 100) * parsedAmount).toFixed(2))
                        : parseFloat(customSplits[m.userId] ?? '0')
                    : 0;
                  return (
                    <TouchableOpacity key={m.userId} style={sheetStyles.avatarCircleItem} onPress={() => togglePerson(m.userId)} activeOpacity={0.75}>
                      <View style={[sheetStyles.avatarCircle, { backgroundColor: selected ? av.bg : colors.cardElevated }, selected && sheetStyles.avatarCircleOn]}>
                        <Text style={[sheetStyles.avatarCircleText, { color: selected ? av.text : colors.text3 }]}>
                          {m.userId === currentUserId ? userInitials : m.initials}
                        </Text>
                      </View>
                      <Text style={[sheetStyles.avatarCircleAmt, !selected && sheetStyles.avatarCircleAmtDim]}>
                        {selected && splitAmt > 0 ? formatAmount(splitAmt) : '—'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

          </View>
        </ScrollView>

        {/* Pinned CTA */}
        <View style={[sheetStyles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <Animated.View style={ctaAnimStyle}>
            <TouchableOpacity
              style={[
                sheetStyles.cta,
                ctaState === 'success' && sheetStyles.ctaSuccess,
                ctaState === 'error'   && sheetStyles.ctaError,
                (addExpense.isPending || ctaState !== 'idle') && { opacity: ctaState === 'idle' ? 0.5 : 1 },
                parsedAmount === 0 && ctaState === 'idle' && { opacity: 0.5 },
              ]}
              onPress={handleAdd}
              activeOpacity={0.85}
              disabled={addExpense.isPending || ctaState !== 'idle'}
            >
              <Text style={sheetStyles.ctaText}>
                {ctaState === 'success' ? '✓ Added!' :
                 ctaState === 'error'   ? 'Failed — try again' :
                 addExpense.isPending   ? 'Saving…' : 'Add Expense →'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Paid By picker */}
        <Modal visible={paidBySheetOpen} transparent animationType="slide" onRequestClose={() => setPaidBySheetOpen(false)}>
          <View style={sheetStyles.pickerRoot}>
            <Pressable style={sheetStyles.pickerBackdrop} onPress={() => setPaidBySheetOpen(false)} />
            <View style={sheetStyles.pickerContainer}>
              <View style={sheetStyles.pickerHandle} />
              <Text style={sheetStyles.pickerTitle}>Paid by</Text>
              {allMembers.map(m => {
                const av = avatarColors[m.avatarColor] ?? avatarColors.green;
                const isSelected = paidBy === m.userId;
                return (
                  <TouchableOpacity
                    key={m.userId}
                    style={[sheetStyles.pickerRow, isSelected && sheetStyles.pickerRowSelected]}
                    onPress={() => { setPaidBy(m.userId); setPaidBySheetOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[sheetStyles.pickerAvatar, { backgroundColor: av.bg }]}>
                      <Text style={[sheetStyles.pickerAvatarText, { color: av.text }]}>
                        {m.userId === currentUserId ? userInitials : m.initials}
                      </Text>
                    </View>
                    <Text style={[sheetStyles.pickerRowName, isSelected && sheetStyles.pickerRowNameSelected]}>
                      {m.userId === currentUserId ? 'You' : m.name}
                    </Text>
                    {isSelected && <Text style={sheetStyles.pickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Modal>

        <CategoryPickerModal visible={catPickerOpen} selectedId={selectedCatId} onSelect={setSelectedCatId} onClose={() => setCatPickerOpen(false)} />

        <SplitSheet
          visible={splitSheetOpen}
          onClose={() => setSplitSheetOpen(false)}
          members={allMembers
            .filter(m => selectedPeople.has(m.userId))
            .map(m => ({ id: m.userId, name: m.userId === currentUserId ? (currentUserName ?? 'You') : m.name, avatar_color: m.avatarColor })) as any}
          totalAmount={parsedAmount}
          mode={splitMode}
          splits={customSplits}
          currentUserId={currentUserId}
          onConfirm={(mode, splits) => { setSplitMode(mode); setCustomSplits(splits); setSplitSheetOpen(false); }}
        />
      </Animated.View>
    </Modal>
  );
}

const GROUP_TYPE_LABEL: Record<string, string> = {
  flat: 'Flat', trip: 'Trip', custom: 'Group', personal: 'Personal',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GroupDetailScreen() {
  const router = useRouter();
  const { safePush } = useNavGuard();
  const insets = useSafeAreaInsets();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const currentUser = useUserStore(s => s.currentUser);

  const { data: group, isLoading: groupLoading } = useGroupDetail(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: balances = [] } = useBalances(groupId);
  const { net: netAmt } = useNetBalance(groupId as string);
  const { data: expenses = [] } = useExpenses(groupId);
  const { data: settlements = [] } = useSettlements(groupId as string);
  const settleUp = useSettleUp();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  const isPersonalGroup = group?.group_type === 'personal';

  const handlePay = useCallback(async (b: Balance) => {
    if (!groupId) return;
    try {
      await settleUp.mutateAsync({ groupId, toUserId: b.userId, amount: Math.abs(b.amount) });
      showToast(`Settled with ${b.name} ✓`);
    } catch {
      showToast('Could not record settlement');
    }
  }, [groupId, settleUp, showToast]);

  const memberMap = new Map<string, MemberLite>(
    members.map(m => [m.userId, { id: m.userId, name: m.name, color: m.avatarColor }])
  );


  if (groupLoading && !group) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={colors.text2} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Merge expenses + settlements into a single date-sorted activity feed
  type ActivityItem =
    | { kind: 'expense'; date: string; data: typeof expenses[number] }
    | { kind: 'settlement'; date: string; data: typeof settlements[number] };

  const activityFeed: ActivityItem[] = [
    ...expenses.map(e => ({ kind: 'expense' as const, date: e.created_at, data: e })),
    ...settlements.map(s => ({ kind: 'settlement' as const, date: s.settled_at, data: s })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {group?.cover_emoji ?? ''} {group?.name ?? ''}
        </Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push(`/groups/edit/${groupId}` as never)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Group banner */}
        <View style={styles.banner}>
          {/* Top: emoji + info + balance */}
          <View style={styles.bannerTop}>
            <View style={styles.bannerEmojiWrap}>
              <Text style={styles.bannerEmojiText}>{group?.cover_emoji}</Text>
            </View>

            <View style={styles.bannerInfo}>
              <View style={styles.bannerNameRow}>
                <Text style={styles.bannerName} numberOfLines={1}>{group?.name}</Text>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {GROUP_TYPE_LABEL[group?.group_type ?? 'custom']}
                  </Text>
                </View>
              </View>
              <View style={styles.avatarStack}>
                {members.slice(0, 5).map((m, i) => {
                  const av = avatarColors[m.avatarColor] ?? avatarColors.green;
                  return (
                    <View
                      key={m.userId}
                      style={[styles.stackAvatar, { backgroundColor: av.bg, marginLeft: i === 0 ? 0 : -8 }]}
                    >
                      <Text style={[styles.stackAvatarText, { color: av.text }]}>{m.initials}</Text>
                    </View>
                  );
                })}
                {members.length > 5 && (
                  <View style={[styles.stackAvatar, { backgroundColor: colors.cardElevated, marginLeft: -8 }]}>
                    <Text style={[styles.stackAvatarText, { color: colors.text2 }]}>+{members.length - 5}</Text>
                  </View>
                )}
                <Text style={styles.memberCountText}>
                  {group?.member_count ?? 0} {(group?.member_count ?? 0) === 1 ? 'member' : 'members'}
                </Text>
              </View>
            </View>

          </View>

          {/* Stats row — total spent + expense count */}
          <View style={styles.bannerStats}>
            <View style={styles.bannerStat}>
              <Text style={styles.bannerStatValue}>{formatAmount(totalExpenses)}</Text>
              <Text style={styles.bannerStatLabel}>total spent</Text>
            </View>
            <View style={styles.bannerStatDivider} />
            <View style={styles.bannerStat}>
              <Text style={styles.bannerStatValue}>{expenses.length}</Text>
              <Text style={styles.bannerStatLabel}>{expenses.length === 1 ? 'expense' : 'expenses'}</Text>
            </View>
          </View>
        </View>

        {/* Balances — only for non-personal groups */}
        {!isPersonalGroup && balances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BALANCES</Text>
            <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
              {balances.map((b, i) => (
                <View key={b.userId}>
                  <BalanceRow balance={b} onPay={handlePay} />
                  {i < balances.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Activity feed — expenses + settlements merged */}
        <View style={styles.section}>
          <View style={styles.expHeader}>
            <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>ACTIVITY</Text>
            {totalExpenses > 0 && (
              <Text style={styles.expTotal}>{formatAmount(totalExpenses)} spent</Text>
            )}
          </View>
          {activityFeed.length === 0 ? (
            <View style={[styles.card, styles.emptyCard]}>
              <View style={styles.emptyIconWrap}>
                <Text style={styles.emptyEmoji}>
                  {group?.group_type === 'personal' ? '📝' : '💸'}
                </Text>
              </View>
              <Text style={styles.emptyText}>No expenses yet</Text>
              <Text style={styles.emptyHint}>
                {group?.group_type === 'personal'
                  ? 'Track your personal spending by adding an expense.'
                  : `Add the first expense and start splitting with ${members.length > 1 ? 'the group' : 'your group'}.`}
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => setSheetOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyAddBtnText}>+ Add Expense</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, { padding: 0, paddingVertical: 4 }]}>
              {activityFeed.slice(0, 20).map((item, i, arr) => (
                <View key={item.kind === 'expense' ? item.data.id : `s-${item.data.id}`}>
                  {item.kind === 'expense' ? (
                    <ActivityRow
                      exp={item.data}
                      memberMap={memberMap}
                      currentUserId={currentUserId}
                      onPress={() => safePush(`/expense/${item.data.id}`)}
                    />
                  ) : (
                    <SettlementRow
                      settlement={item.data}
                      memberMap={memberMap}
                      currentUserId={currentUserId}
                      onPress={() => router.push(`/settlement/${item.data.id}` as never)}
                    />
                  )}
                  {i < arr.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#000" />
      </TouchableOpacity>

      <ToastNotification message={toast} visible={toastVisible} />

      <AddExpenseSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        groupId={groupId as string}
        groupName={group?.name ?? ''}
        groupEmoji={group?.cover_emoji ?? '🏠'}
        currentUserId={currentUserId}
        currentUserName={currentUser?.name ?? null}
        currentUserColor={(currentUser?.avatar_color ?? 'green') as AvatarColor}
        members={members}
        onSuccess={showToast}
      />
    </SafeAreaView>
  );
}

// ─── Sheet Styles ─────────────────────────────────────────────────────────────

const sheetStyles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
  },

  // Header
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  groupBadge: {
    backgroundColor: 'rgba(0,212,154,0.10)',
    borderWidth: 1, borderColor: 'rgba(0,212,154,0.22)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  groupBadgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.accent },
  sheetTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.syne, fontSize: 16, color: colors.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 },

  // Amount hero
  amountSection: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rupee: { fontFamily: fonts.syne, fontWeight: '800', color: colors.text2, flexShrink: 0 },
  amountInput: {
    fontFamily: fonts.syne, fontWeight: '800', color: colors.text,
    padding: 0, margin: 0, minWidth: 48,
  },
  fieldErrorCenter: {
    fontFamily: fonts.dmSans, fontSize: 11, color: colors.danger,
    marginTop: 8, textAlign: 'center',
  },

  // Title
  titleSection: { marginBottom: 20 },
  titleInput: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 16, fontWeight: '600',
    color: colors.text, textAlign: 'center', paddingVertical: 0, paddingHorizontal: 24,
  },
  titleInputError: { color: colors.danger },

  // Details card
  detailsCard: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 20,
  },
  cardRow: { paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  cardRowLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text2,
  },
  cardDivider: { height: 1, backgroundColor: colors.border },
  hChipsContent: { gap: 8, paddingBottom: 2 },
  catSelectedLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '600', color: colors.accent },

  moreCatChip: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, paddingVertical: 7,
    borderRadius: 14, backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', minHeight: 36,
  },
  moreCatChipSelected: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  moreCatText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.text2, textAlign: 'center' },
  moreCatTextSelected: { color: colors.accent },

  // Paid By row
  paidByRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16, minHeight: 68,
  },
  paidByRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paidByAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  paidByAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '700' },
  paidByName: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text },
  paidByChevron: { fontFamily: fonts.dmSans, fontSize: 18, color: colors.text3, lineHeight: 20 },

  // Split With
  splitWithHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  splitPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
  },
  splitPillActive:     { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  splitPillText:       { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.text2 },
  splitPillTextActive: { color: colors.accent },
  avatarCircleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarCircleItem: { alignItems: 'center', gap: 5 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarCircleOn: { borderColor: colors.borderEmphasis },
  avatarCircleText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  avatarCircleAmt: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '600', color: colors.accent },
  avatarCircleAmtDim: { color: colors.text3 },

  // Pinned footer + CTA
  footer: {
    paddingHorizontal: 22, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  cta: {
    backgroundColor: colors.accent, borderRadius: 14, height: 46,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 16, elevation: 10,
  },
  ctaSuccess: { backgroundColor: '#00b87a', shadowColor: '#00b87a' },
  ctaError:   { backgroundColor: colors.danger, shadowColor: colors.danger },
  ctaText: { fontFamily: fonts.syne, fontSize: 15, fontWeight: '800', color: '#000' },

  // Paid By picker sheet
  pickerRoot:      { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  pickerContainer: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.borderEmphasis, paddingTop: 12, paddingHorizontal: 20,
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20,
  },
  pickerTitle: { fontFamily: fonts.syne, fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 16 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
  },
  pickerRowSelected: { backgroundColor: colors.accentDim },
  pickerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  pickerRowName: { flex: 1, fontFamily: fonts.dmSansSemiBold, fontSize: 14, fontWeight: '600', color: colors.text },
  pickerRowNameSelected: { color: colors.accent },
  pickerCheck: { fontFamily: fonts.dmSansSemiBold, fontSize: 14, color: colors.accent },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: fonts.syne, fontSize: 17, color: colors.text,
  },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 16 },

  card: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border, padding: 18,
  },
  cardAccent: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  cardDanger: { backgroundColor: colors.dangerDim, borderColor: 'rgba(255,89,89,0.18)' },
  cardNeutral: { backgroundColor: colors.card, borderColor: colors.border },

  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text2,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  balanceAmt: {
    fontFamily: fonts.syne, fontSize: 38, letterSpacing: -2, marginBottom: 4,
  },
  balanceSub: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2, marginBottom: 12 },
  section: { marginBottom: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },

  expHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  expTotal: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.text2 },
  emptyCard: { paddingVertical: 36, alignItems: 'center', gap: 8 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: { fontFamily: fonts.syne, fontSize: 15, color: colors.text },
  emptyHint: {
    fontFamily: fonts.dmSans, fontSize: 12, color: colors.text3,
    textAlign: 'center', lineHeight: 18, paddingHorizontal: 16,
  },
  emptyAddBtn: {
    marginTop: 8,
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 24,
  },
  emptyAddBtnText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 13, color: colors.accent,
  },

  fab: {
    position: 'absolute',
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },

  // ── Banner ─────────────────────────────────────────────────────────────────
  banner: {
    backgroundColor: colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 14,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  bannerEmojiWrap: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bannerEmojiText: { fontSize: 30 },
  bannerInfo: { flex: 1, justifyContent: 'center', gap: 6 },
  bannerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerName: { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  typeBadge: {
    backgroundColor: colors.cardElevated, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  typeBadgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text3 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackAvatar: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.card,
  },
  stackAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 7 },
  memberCountText: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginLeft: 8 },
  bannerStats: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14,
  },
  bannerStat: { flex: 1, alignItems: 'center', gap: 4 },
  bannerStatDivider: { width: 1, backgroundColor: colors.border },
  bannerStatValue: { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', color: colors.text },
  bannerStatLabel: { fontFamily: fonts.dmSans, fontSize: 10, color: colors.text2 },
});
