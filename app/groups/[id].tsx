import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import {
  formatAmount,
  sanitizeAmountInput,
  isValidAmount,
  parseAmount,
} from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import { categories } from '@/constants/sampleData';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroupDetail, useGroupMembers } from '@/hooks/useGroups';
import { useBalances, useNetBalance } from '@/hooks/useBalances';
import { useExpenses, useAddExpense } from '@/hooks/useExpenses';
import { useSettleUp, useSettlements } from '@/hooks/useSettlements';
import { ToastNotification } from '@/components/ToastNotification';
import { ActivityRow, SettlementRow } from '@/components/ActivityRow';
import { PersonChip } from '@/components/PersonChip';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import type { AvatarColor } from '@/types/database';
import type { MemberLite } from '@/components/ActivityRow';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function amountFontSize(len: number) {
  if (len > 8) return 26;
  if (len > 6) return 32;
  if (len > 4) return 40;
  return 50;
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

  // Animation — slide distance equals the sheet height so it starts fully off-screen
  const sheetY = useSharedValue(sheetHeight);
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

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOp.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  // Form state
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCatId, setSelectedCatId] = useState(categories[0].id);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [amountError, setAmountError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  const allMembers = members ?? [];

  // Default-select all members when they load
  useEffect(() => {
    setSelectedPeople(new Set(allMembers.map(m => m.userId)));
  }, [members?.length]);

  const resetForm = useCallback(() => {
    setAmount('');
    setTitle('');
    setSelectedCatId(categories[0].id);
    setPaidBy(currentUserId);
    setSelectedPeople(new Set(allMembers.map(m => m.userId)));
    setAmountError('');
    setTitleError('');
  }, [currentUserId, allMembers]);

  const handleClose = useCallback(() => {
    resetForm();
    closeSheet();
  }, [resetForm, closeSheet]);

  const ctaScale = useSharedValue(1);
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  const handleAdd = useCallback(() => {
    const normalised = amount.endsWith('.') ? amount.slice(0, -1) : amount;
    let hasError = false;
    if (!isValidAmount(normalised)) { setAmountError('Enter a valid amount'); hasError = true; }
    if (!title.trim()) { setTitleError('Title is required'); hasError = true; }
    if (selectedPeople.size === 0) {
      onSuccess('Select at least one person to split with');
      return;
    }
    if (hasError) return;

    ctaScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 120 }),
    );

    const parsed = parseAmount(normalised);
    const splitWith = Array.from(selectedPeople);

    addExpense.mutate(
      {
        groupId,
        title: title.trim(),
        amount: parsed,
        category: selectedCatId,
        paidBy,
        addedBy: currentUserId,
        splitWith,
      },
      {
        onSuccess: () => {
          onSuccess(`✓ ${formatAmount(parsed)} added!`);
          resetForm();
          closeSheet();
        },
        onError: (err: any) => {
          onSuccess(`Couldn't save: ${err?.message ?? 'try again'}`);
          closeSheet();
        },
      },
    );
  }, [amount, title, selectedCatId, paidBy, selectedPeople, groupId, currentUserId, addExpense, onSuccess, resetForm, closeSheet, ctaScale]);

  const fontSize = amountFontSize(amount.length);
  const splitCount = selectedPeople.size;
  const parsed = parseAmount(amount.endsWith('.') ? amount.slice(0, -1) : amount);
  const each = parsed > 0 && splitCount > 0 ? parseFloat((parsed / splitCount).toFixed(2)) : 0;

  const userInitials = currentUserName ? initialsFromName(currentUserName) : 'ME';

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, sheetStyles.overlay, overlayStyle]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      {/* Sheet — fixed height so ScrollView inside can actually scroll */}
      <Animated.View
        style={[
          sheetStyles.sheet,
          { height: sheetHeight, paddingTop: insets.top, paddingBottom: insets.bottom + 12 },
          sheetStyle,
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Drag handle */}
          <View style={sheetStyles.handle} />

          {/* Header */}
          <View style={sheetStyles.sheetHeader}>
            <View style={sheetStyles.groupBadge}>
              <Text style={sheetStyles.groupBadgeText}>{groupEmoji} {groupName}</Text>
            </View>
            <Text style={sheetStyles.sheetTitle}>Add Expense</Text>
            <TouchableOpacity
              style={sheetStyles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.text2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={sheetStyles.scroll}
            contentContainerStyle={sheetStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Amount */}
            <View style={sheetStyles.amountSection}>
              <View style={sheetStyles.amountBox}>
                <Text style={[sheetStyles.rupee, { fontSize: fontSize * 0.6, lineHeight: fontSize }]}>₹</Text>
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
              {!!amountError && <Text style={sheetStyles.fieldError}>{amountError}</Text>}
            </View>

            {/* Title */}
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionLabel}>TITLE *</Text>
              <View style={[sheetStyles.inputBox, !!titleError && sheetStyles.inputError]}>
                <TextInput
                  style={sheetStyles.inputText}
                  value={title}
                  onChangeText={t => { setTitle(t); if (titleError) setTitleError(''); }}
                  placeholder="What's this for?"
                  placeholderTextColor={colors.text3}
                  selectionColor={colors.accent}
                  returnKeyType="done"
                  maxLength={60}
                />
              </View>
              {!!titleError && <Text style={sheetStyles.fieldError}>{titleError}</Text>}
            </View>

            {/* Category */}
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionLabel}>CATEGORY</Text>
              <View style={sheetStyles.catGrid}>
                {categories.slice(0, 9).map(cat => {
                  const selected = selectedCatId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[sheetStyles.catChip, selected && sheetStyles.catChipOn]}
                      onPress={() => setSelectedCatId(cat.id)}
                      activeOpacity={0.75}
                    >
                      <Text style={sheetStyles.catChipEmoji}>{cat.emoji}</Text>
                      <Text style={[sheetStyles.catChipLabel, selected && sheetStyles.catChipLabelOn]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {(() => {
                  const isMoreSel = !categories.slice(0, 9).find(c => c.id === selectedCatId);
                  const moreCat = isMoreSel ? categories.find(c => c.id === selectedCatId) : null;
                  return (
                    <TouchableOpacity
                      style={[sheetStyles.moreCatChip, isMoreSel && sheetStyles.catChipOn]}
                      onPress={() => setCatPickerOpen(true)}
                      activeOpacity={0.75}
                    >
                      <Text style={[sheetStyles.moreCatText, isMoreSel && sheetStyles.catChipLabelOn]}>
                        {moreCat ? `${moreCat.emoji} ${moreCat.label}` : 'More +'}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </View>

            {/* Paid By */}
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionLabel}>PAID BY</Text>
              <View style={sheetStyles.chipWrap}>
                {allMembers.map(m => (
                  <PersonChip
                    key={m.userId}
                    label={m.userId === currentUserId ? 'You' : m.name}
                    selected={paidBy === m.userId}
                    onPress={() => setPaidBy(m.userId)}
                    initials={m.userId === currentUserId ? userInitials : m.initials}
                    avatarColor={m.avatarColor}
                  />
                ))}
              </View>
            </View>

            {/* Split With */}
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionLabel}>SPLIT WITH</Text>
              <View style={sheetStyles.chipWrap}>
                {allMembers.map(m => (
                  <PersonChip
                    key={m.userId}
                    label={m.userId === currentUserId ? 'You' : m.name}
                    selected={selectedPeople.has(m.userId)}
                    onPress={() => setSelectedPeople(prev => {
                      const next = new Set(prev);
                      if (next.has(m.userId)) next.delete(m.userId);
                      else next.add(m.userId);
                      return next;
                    })}
                    initials={m.userId === currentUserId ? userInitials : m.initials}
                    avatarColor={m.avatarColor}
                  />
                ))}
              </View>
              {each > 0 && selectedPeople.size > 0 && (
                <View style={sheetStyles.splitHintRow}>
                  <Text style={sheetStyles.splitHint}>
                    Each pays {formatAmount(each)} · {splitCount} people
                  </Text>
                </View>
              )}
            </View>

            {/* CTA */}
            <Animated.View style={ctaStyle}>
              <TouchableOpacity
                style={[sheetStyles.cta, addExpense.isPending && { opacity: 0.5 }]}
                onPress={handleAdd}
                activeOpacity={0.85}
                disabled={addExpense.isPending}
              >
                <Text style={sheetStyles.ctaText}>
                  {addExpense.isPending ? 'Saving…' : 'Add Expense →'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        <CategoryPickerModal
          visible={catPickerOpen}
          selectedId={selectedCatId}
          onSelect={setSelectedCatId}
          onClose={() => setCatPickerOpen(false)}
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

  const owedBalances = balances.filter(b => b.amount < 0);
  const handleSettleAll = useCallback(async () => {
    if (!groupId || owedBalances.length === 0) return;
    try {
      await Promise.all(owedBalances.map(b =>
        settleUp.mutateAsync({ groupId, toUserId: b.userId, amount: Math.abs(b.amount) })
      ));
      showToast('All settlements recorded ✓');
    } catch {}
  }, [groupId, owedBalances, settleUp, showToast]);

  const memberMap = new Map<string, MemberLite>(
    members.map(m => [m.userId, { id: m.userId, name: m.name, color: m.avatarColor }])
  );

  const isOwed = netAmt >= 0;
  const hasBalance = Math.abs(netAmt) >= 0.01;

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
          {/* Top: emoji + name + type + avatars */}
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

          {/* Stats row */}
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
            <View style={styles.bannerStatDivider} />
            <View style={styles.bannerStat}>
              <Text style={[styles.bannerStatValue, hasBalance ? (isOwed ? { color: colors.accent } : { color: colors.danger }) : { color: colors.text2 }]}>
                {hasBalance ? `${isOwed ? '+' : '−'}${formatAmount(Math.abs(netAmt))}` : '₹0'}
              </Text>
              <Text style={styles.bannerStatLabel}>your balance</Text>
            </View>
          </View>
        </View>

        {/* Settle All — only when you owe money */}
        {!isOwed && hasBalance && (
          <TouchableOpacity
            style={styles.settleAllBtn}
            onPress={handleSettleAll}
            activeOpacity={0.8}
            disabled={settleUp.isPending}
          >
            <Text style={styles.settleAllBtnText}>
              ⚡ Settle All · {formatAmount(owedBalances.reduce((s, b) => s + Math.abs(b.amount), 0))}
            </Text>
          </TouchableOpacity>
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
              <Text style={styles.emptyEmoji}>💸</Text>
              <Text style={styles.emptyText}>No activity yet</Text>
              <Text style={styles.emptyHint}>Tap + to add the first expense</Text>
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
                      onPress={() => router.push(`/expense/${item.data.id}` as never)}
                    />
                  ) : (
                    <SettlementRow
                      settlement={item.data}
                      memberMap={memberMap}
                      currentUserId={currentUserId}
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
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
  handle: { height: 0 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  groupBadge: {
    backgroundColor: 'rgba(0,212,154,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,154,0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupBadgeText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 11,
    color: colors.accent,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.syne,
    fontSize: 16,
    color: colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },

  amountSection: { alignItems: 'center', marginVertical: 16 },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'stretch',
    gap: 4,
  },
  rupee: {
    fontFamily: fonts.syne,
    fontWeight: '800',
    color: colors.text2,
    flexShrink: 0,
  },
  amountInput: {
    fontFamily: fonts.syne,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
    padding: 0,
    textAlign: 'center',
    minWidth: 0,
  },
  fieldError: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.danger,
    marginTop: 5,
    alignSelf: 'flex-start',
  },

  section: { marginBottom: 18 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginBottom: 10,
  },
  inputBox: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputError: { borderColor: colors.danger },
  inputText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14,
    backgroundColor: colors.cardElevated, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)', minHeight: 60, width: '30.5%',
  },
  catChipOn: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  catChipEmoji: { fontSize: 18 },
  catChipLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text2, textAlign: 'center' },
  catChipLabelOn: { color: colors.accent },
  moreCatChip: {
    width: '30.5%', minHeight: 60, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, borderRadius: 14,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)',
  },
  moreCatText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.text2, textAlign: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  splitHintRow: {
    marginTop: 10,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentMid,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  splitHint: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 12,
    color: colors.accent,
  },

  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
    marginTop: 4,
  },
  ctaText: {
    fontFamily: fonts.syne,
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
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
  settleAllBtn: {
    backgroundColor: colors.danger, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 20, alignSelf: 'flex-start',
  },
  settleAllBtnText: { fontFamily: fonts.syne, fontSize: 13, fontWeight: '800', color: '#fff' },

  section: { marginBottom: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },

  expHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  expTotal: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, color: colors.text2 },
  emptyCard: { paddingVertical: 36, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontFamily: fonts.syne, fontSize: 15, color: colors.text },
  emptyHint: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text3 },

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
  bannerTop: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  bannerEmojiWrap: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bannerEmojiText: { fontSize: 28 },
  bannerInfo: { flex: 1, justifyContent: 'center', gap: 6 },
  bannerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerName: { fontFamily: fonts.syne, fontSize: 17, color: colors.text, flex: 1 },
  typeBadge: {
    backgroundColor: colors.cardElevated, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  typeBadgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 10, color: colors.text3 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackAvatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.card,
  },
  stackAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 8 },
  memberCountText: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginLeft: 8 },
  bannerStats: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14,
  },
  bannerStat: { flex: 1, alignItems: 'center', gap: 3 },
  bannerStatDivider: { width: 1, backgroundColor: colors.border },
  bannerStatValue: { fontFamily: fonts.syne, fontSize: 16, color: colors.text },
  bannerStatLabel: { fontFamily: fonts.dmSans, fontSize: 10, color: colors.text2 },
});
