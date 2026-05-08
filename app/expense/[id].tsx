import { formatAmount, formatDisplayName } from '@/constants/amountUtils';
import { avatarColors, colors } from '@/constants/colors';
import { initialsFromName } from '@/constants/dateFormat';
import { categories } from '@/constants/sampleData';
import { fonts } from '@/constants/typography';
import { useAddComment, useDeleteExpense, useExpense } from '@/hooks/useExpenses';
import { useMembers } from '@/hooks/useMembers';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroupStore } from '@/store/useGroupStore';
import { useUserStore } from '@/store/useUserStore';
import type { AvatarColor, ExpenseComment, User } from '@/types/database';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NetType = 'lent' | 'owed' | 'personal' | 'uninvolved';

function formatDateTime(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  return { date, time };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).toUpperCase();
}

const NET_COLORS: Record<NetType, { main: string; dim: string; bg: string }> = {
  lent:       { main: colors.accent, dim: 'rgba(0,212,154,0.60)', bg: colors.accentDim   },
  owed:       { main: colors.danger, dim: 'rgba(255,89,89,0.60)', bg: colors.dangerDim   },
  personal:   { main: colors.text,   dim: colors.text2,           bg: 'transparent'      },
  uninvolved: { main: colors.text3,  dim: colors.text3,           bg: 'transparent'      },
};

const NET_LABELS: Record<NetType, string> = {
  lent: 'you lent', owed: 'you owe', personal: '', uninvolved: 'not involved',
};

// ─── Comment bubble ───────────────────────────────────────────────────────────

function CommentBubble({ comment, memberMap, currentUserId }: { comment: ExpenseComment; memberMap: Map<string, User>; currentUserId: string }) {
  const isMe = comment.user_id === currentUserId;
  const member = memberMap.get(comment.user_id);
  if (!member) return null;
  const av = avatarColors[(member.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;

  return (
    <View style={[bubbleStyles.row, isMe && bubbleStyles.rowReverse]}>
      {!isMe && (
        <View style={[bubbleStyles.avatar, { backgroundColor: av.bg }]}>
          <Text style={[bubbleStyles.avatarText, { color: av.text }]}>
            {initialsFromName(member.name)}
          </Text>
        </View>
      )}
      <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem]}>
        {!isMe && <Text style={bubbleStyles.senderName}>{formatDisplayName(member.name)}</Text>}
        <Text style={[bubbleStyles.messageText, isMe && { color: '#000' }]}>
          {comment.text}
        </Text>
        <Text style={[bubbleStyles.timestamp, isMe && { color: 'rgba(0,0,0,0.5)' }]}>
          {formatTime(comment.created_at)}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  rowReverse: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '700' },
  bubble: { maxWidth: '72%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleThem: { backgroundColor: colors.cardElevated, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  senderName: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '700',
    color: colors.text2, marginBottom: 3,
  },
  messageText: {
    fontFamily: fonts.dmSans, fontSize: 13,
    color: colors.text, lineHeight: 18,
  },
  timestamp: {
    fontFamily: fonts.dmSans, fontSize: 11,
    color: colors.text3, marginTop: 4, textAlign: 'right',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: expense, isLoading } = useExpense(id);
  // Use the expense's own group_id so member names resolve correctly regardless
  // of which group the user navigated from.
  const { data: members = [] } = useMembers(expense?.group_id ?? groupId);
  const deleteExpense = useDeleteExpense();
  const addComment = useAddComment();

  const scrollRef = useRef<ScrollView>(null);
  const [commentText, setCommentText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loading state
  if (isLoading && !expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.notFound}>
          <ActivityIndicator color={colors.text2} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.notFound}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.notFoundText}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived data ──
  const memberMap = new Map<string, User>(members.map(m => [m.id, m]));
  const category = expense.category ? categories.find(c => c.id === expense.category) : null;
  const emoji = category?.emoji ?? '📦';
  const payer = expense.paid_by ? memberMap.get(expense.paid_by) : null;
  const adder = expense.added_by ? memberMap.get(expense.added_by) : null;

  const splits = expense.splits ?? [];
  const splitMap = new Map(splits.map(s => [s.user_id, s.amount_owed]));
  const splitMembers = splits
    .map(s => memberMap.get(s.user_id))
    .filter((m): m is User => !!m);

  const myShare = splitMap.get(currentUserId) ?? 0;
  const isPersonal = splitMembers.length <= 1;
  const isEqual = splits.length > 0 && splits.every(s => Math.abs(s.amount_owed - splits[0].amount_owed) < 0.01);
  const isYouPaid = expense.paid_by === currentUserId;

  // Compute net
  const net: { type: NetType; amount: number } = (() => {
    const otherSplits = splits.filter(s => s.user_id !== currentUserId);
    if (otherSplits.length === 0) return { type: 'personal', amount: expense.amount };
    if (isYouPaid) {
      const lent = otherSplits.reduce((sum, s) => sum + s.amount_owed, 0);
      return { type: 'lent', amount: parseFloat(lent.toFixed(2)) };
    }
    if (myShare === 0) return { type: 'uninvolved', amount: 0 };
    return { type: 'owed', amount: myShare };
  })();
  const netColor = NET_COLORS[net.type];

  const createdFmt = formatDateTime(expense.created_at);
  const updatedFmt = formatDateTime(expense.updated_at);
  const comments = expense.comments ?? [];

  // ── Handlers ──
  const handleDelete = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    deleteExpense.mutate(
      { expenseId: expense.id, groupId: expense.group_id },
      { onSuccess: () => router.back() }
    );
  };

  const handleSend = () => {
    const text = commentText.trim();
    if (!text) return;
    addComment.mutate(
      {
        expenseId: expense.id,
        groupId: expense.group_id,
        userId: currentUserId,
        text,
      },
      {
        onSuccess: () => {
          setCommentText('');
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
        },
      }
    );
  };

  // Avatar color helper for split rows
  const avFor = (m: User) => avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Fixed header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/expense/edit/${expense.id}` as never)}
            >
              <Ionicons name="pencil-outline" size={13} color={colors.text2} />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, deleteConfirm ? styles.actionBtnDanger : styles.actionBtnDelete]}
              onPress={handleDelete}
              disabled={deleteExpense.isPending}
            >
              <Ionicons
                name={deleteConfirm ? 'warning-outline' : 'trash-outline'}
                size={13}
                color={colors.danger}
              />
              <Text style={[styles.actionBtnText, styles.actionBtnTextDelete]}>
                {deleteConfirm ? 'Confirm?' : 'Delete'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable detail + comments */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{expense.title}</Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroAmount}>{formatAmount(expense.amount)}</Text>
              {net.type !== 'personal' && (
                <View style={[styles.netPill, { backgroundColor: netColor.bg, borderColor: netColor.main + '44' }]}>
                  {net.type === 'uninvolved' ? (
                    <Text style={[styles.netPillLabel, { color: netColor.main }]}>not involved</Text>
                  ) : (
                    <>
                      <Text style={[styles.netPillAmt, { color: netColor.main }]}>
                        {net.type === 'owed' ? '−' : '+'}{formatAmount(net.amount)}
                      </Text>
                      <Text style={[styles.netPillLabel, { color: netColor.dim }]}>
                        {NET_LABELS[net.type]}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>
            {category && (
              <Text style={styles.heroCat}>{emoji}  {category.label}</Text>
            )}
          </View>

          {/* Added by / edited meta */}
          <View style={styles.metaBlock}>
            {adder && (
              <View style={styles.metaLine}>
                <View style={[styles.metaAvatar, { backgroundColor: avFor(adder).bg }]}>
                  <Text style={[styles.metaAvatarText, { color: avFor(adder).text }]}>
                    {initialsFromName(adder.name)}
                  </Text>
                </View>
                <View style={styles.metaTextCol}>
                  <Text style={styles.metaLabel}>Added by {adder.id === currentUserId ? 'you' : formatDisplayName(adder.name)}</Text>
                  {createdFmt && <Text style={styles.metaDate}>{createdFmt.date}  {createdFmt.time}</Text>}
                </View>
              </View>
            )}
            {updatedFmt && (
              <View style={styles.metaLine}>
                <View style={styles.metaIconBox}>
                  <Ionicons name="pencil-outline" size={15} color={colors.text3} />
                </View>
                <View style={styles.metaTextCol}>
                  <Text style={styles.metaLabel}>Last edited</Text>
                  <Text style={styles.metaDate}>{updatedFmt.date}  {updatedFmt.time}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Paid by */}
          {payer && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PAID BY</Text>
              <View style={styles.card}>
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, { backgroundColor: avFor(payer).bg }]}>
                    <Text style={[styles.avatarText, { color: avFor(payer).text }]}>
                      {initialsFromName(payer.name)}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {payer.id === currentUserId ? `You (${formatDisplayName(payer.name)})` : formatDisplayName(payer.name)}
                    </Text>
                    <Text style={styles.memberSub}>
                      Paid {formatAmount(expense.amount)}
                    </Text>
                  </View>
                  <View style={[styles.badge, isYouPaid ? styles.badgeGreen : styles.badgeDefault]}>
                    <Text style={[styles.badgeText, { color: isYouPaid ? colors.accent : colors.text2 }]}>
                      {isYouPaid ? 'You paid' : 'They paid'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Split with */}
          {splitMembers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SPLIT WITH</Text>
              <View style={[styles.card, styles.cardFlush]}>
                {splitMembers.map((m, i) => {
                  const isPayer = m.id === expense.paid_by;
                  const shareColor = isPayer
                    ? colors.text2
                    : (isYouPaid || m.id === currentUserId) ? colors.danger : colors.text2;
                  return (
                    <View key={m.id}>
                      <View style={styles.splitRow}>
                        <View style={[styles.avatar, { backgroundColor: avFor(m).bg }]}>
                          <Text style={[styles.avatarText, { color: avFor(m).text }]}>
                            {initialsFromName(m.name)}
                          </Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>
                            {m.id === currentUserId ? 'You' : formatDisplayName(m.name)}
                          </Text>
                          {isPayer && (
                            <Text style={styles.payerTagText}>paid · settled</Text>
                          )}
                        </View>
                        <Text style={[styles.shareAmt, { color: shareColor }]}>
                          {isPayer ? '' : '−'}{formatAmount(splitMap.get(m.id) ?? 0)}
                        </Text>
                      </View>
                      {i < splitMembers.length - 1 && <View style={styles.splitDivider} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Note */}
          {expense.note && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTE</Text>
              <View style={styles.card}>
                <Text style={styles.noteText}>{expense.note}</Text>
              </View>
            </View>
          )}

          {/* Comments */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              COMMENTS{comments.length > 0 ? `  ${comments.length}` : ''}
            </Text>
            {comments.length === 0 ? (
              <Text style={styles.emptyComments}>No comments yet. Start the conversation.</Text>
            ) : (
              <View style={styles.commentsList}>
                {[...comments]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map(c => (
                    <CommentBubble key={c.id} comment={c} memberMap={memberMap} currentUserId={currentUserId} />
                  ))}
              </View>
            )}
          </View>

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Pinned comment input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment…"
            placeholderTextColor={colors.text3}
            selectionColor={colors.accent}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline
            editable={!addComment.isPending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, commentText.trim().length > 0 && styles.sendBtnActive]}
            onPress={handleSend}
            activeOpacity={0.75}
            disabled={addComment.isPending}
          >
            <Text style={[styles.sendBtnText, commentText.trim().length > 0 && styles.sendBtnTextActive]}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  notFound: { flex: 1, paddingHorizontal: 22, paddingTop: 16, justifyContent: 'center' },
  notFoundText: {
    fontFamily: fonts.dmSans, fontSize: 14, color: colors.text2,
    textAlign: 'center', marginTop: 60,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    backgroundColor: colors.cardElevated,
  },
  actionBtnDelete: {
    borderColor: 'rgba(255,89,89,0.25)',
    backgroundColor: 'rgba(255,89,89,0.08)',
  },
  actionBtnDanger: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerDim,
  },
  actionBtnText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 13,
    fontWeight: '600', color: colors.text2,
  },
  actionBtnTextDelete: { color: colors.danger },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },

  hero: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 22, padding: 20,
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 15, fontWeight: '600',
    color: colors.text2, marginBottom: 4,
  },
  heroAmountRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  heroAmount: {
    fontFamily: fonts.syne, fontSize: 38, fontWeight: '800',
    letterSpacing: -2, color: colors.text,
  },
  heroCat: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2 },
  metaBlock: { gap: 10, marginBottom: 16, paddingHorizontal: 2 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  metaAvatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '700' },
  metaIconBox: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  metaTextCol: { gap: 2 },
  metaLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.text },
  metaDate: { fontFamily: fonts.dmSans, fontSize: 10, color: colors.text2 },
  heroAdderRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  netPill: {
    alignItems: 'flex-end',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  netPillAmt: { fontFamily: fonts.syne, fontSize: 14, fontWeight: '800' },
  netPillLabel: { fontFamily: fonts.dmSans, fontSize: 11, marginTop: 1 },

  section: { marginBottom: 14 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text2, marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderRadius: 18, padding: 14,
  },
  cardFlush: { padding: 0, paddingVertical: 4 },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 13,
    fontWeight: '600', color: colors.text,
  },
  memberSub: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text2, marginTop: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  badgeGreen: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  badgeDefault: { backgroundColor: colors.cardElevated, borderColor: colors.border },
  badgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '600' },

  splitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11, gap: 10,
  },
  splitDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },
  payerTagText: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.accent, marginTop: 1 },
  shareAmt: { fontFamily: fonts.syne, fontSize: 14, fontWeight: '800', flexShrink: 0 },

  noteText: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text, lineHeight: 20 },

  emptyComments: {
    fontFamily: fonts.dmSans, fontSize: 13, color: colors.text3,
    textAlign: 'center', paddingVertical: 20,
  },
  commentsList: { gap: 0 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  inputField: {
    flex: 1,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sendBtnText: { fontSize: 16, color: colors.text3, fontWeight: '700' },
  sendBtnTextActive: { color: '#000' },
});
