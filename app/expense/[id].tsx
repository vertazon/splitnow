import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, TextInput, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { categories } from '@/constants/sampleData';
import { formatAmount } from '@/constants/amountUtils';
import { initialsFromName } from '@/constants/dateFormat';
import type { ExpenseComment, User, AvatarColor } from '@/types/database';
import { DEV_USER_ID } from '@/lib/auth';
import { useGroupStore } from '@/store/useGroupStore';
import { useUserStore } from '@/store/useUserStore';
import { useExpense, useDeleteExpense, useAddComment } from '@/hooks/useExpenses';
import { useMembers } from '@/hooks/useMembers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NetType = 'lent' | 'owed' | 'personal';

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
  lent:     { main: colors.accent, dim: 'rgba(0,212,154,0.60)', bg: colors.accentDim },
  owed:     { main: colors.danger, dim: 'rgba(255,89,89,0.60)', bg: colors.dangerDim },
  personal: { main: colors.text,   dim: colors.text2,           bg: 'transparent'    },
};

const NET_LABELS: Record<NetType, string> = {
  lent: 'you lent', owed: 'you owe', personal: '',
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
        {!isMe && <Text style={bubbleStyles.senderName}>{member.name}</Text>}
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
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 9, fontWeight: '700' },
  bubble: { maxWidth: '72%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleThem: { backgroundColor: colors.cardElevated, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  senderName: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    color: colors.text2, marginBottom: 3,
  },
  messageText: {
    fontFamily: fonts.dmSans, fontSize: 13,
    color: colors.text, lineHeight: 18,
  },
  timestamp: {
    fontFamily: fonts.dmSans, fontSize: 9,
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
  const splitMembers = splits
    .map(s => memberMap.get(s.user_id))
    .filter((m): m is User => !!m);

  const perPerson = splits.length > 0
    ? parseFloat((expense.amount / splits.length).toFixed(2))
    : expense.amount;

  const isPersonal = splitMembers.length <= 1;
  const isYouPaid = expense.paid_by === currentUserId;

  // Compute net
  const net: { type: NetType; amount: number } = (() => {
    const otherSplits = splits.filter(s => s.user_id !== currentUserId);
    const myShare = splits.find(s => s.user_id === currentUserId)?.amount_owed ?? 0;
    if (otherSplits.length === 0) return { type: 'personal', amount: expense.amount };
    if (isYouPaid) {
      const lent = otherSplits.reduce((sum, s) => sum + s.amount_owed, 0);
      return { type: 'lent', amount: parseFloat(lent.toFixed(2)) };
    }
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
            <View style={styles.emojiCircle}>
              <Text style={styles.heroEmoji}>{emoji}</Text>
            </View>
            <Text style={styles.heroTitle}>{expense.title}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.heroDate}>{createdFmt?.date ?? ''}</Text>
              {category && (
                <>
                  <Text style={styles.heroSep}>·</Text>
                  <View style={styles.catPill}>
                    <Text style={styles.catPillText}>{category.emoji} {category.label}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Entry details */}
          {(createdFmt || adder) && (
            <View style={styles.entryMetaRow}>
              {adder && (
                <View style={[styles.entryMetaAvatar, { backgroundColor: avFor(adder).bg }]}>
                  <Text style={[styles.entryMetaInitials, { color: avFor(adder).text }]}>
                    {initialsFromName(adder.name)}
                  </Text>
                </View>
              )}
              <View style={styles.entryMetaText}>
                {adder && (
                  <Text style={styles.entryMetaLabel}>
                    Added by {adder.id === currentUserId ? 'you' : adder.name}
                    {updatedFmt ? ' · edited' : ''}
                  </Text>
                )}
                {createdFmt && (
                  <Text style={styles.entryMetaTime}>
                    {createdFmt.date} · {createdFmt.time}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Amount card */}
          <View style={styles.amountCard}>
            <View style={styles.amountRow}>
              <View style={styles.amountCol}>
                <Text style={styles.amountColLabel}>TOTAL</Text>
                <Text style={styles.amountColValue}>{formatAmount(expense.amount)}</Text>
                {!isPersonal && (
                  <Text style={styles.amountColSub}>{splitMembers.length} people</Text>
                )}
              </View>
              {!isPersonal && (
                <>
                  <View style={styles.amountColDivider} />
                  <View style={styles.amountCol}>
                    <Text style={styles.amountColLabel}>YOUR SHARE</Text>
                    <Text style={styles.amountColValue}>{formatAmount(perPerson)}</Text>
                    <Text style={styles.amountColSub}>per person</Text>
                  </View>
                </>
              )}
            </View>
            {net.type !== 'personal' && (
              <View style={[styles.netStrip, { backgroundColor: netColor.bg }]}>
                <Text style={[styles.netStripSign, { color: netColor.main }]}>
                  {net.type === 'owed' ? '−' : '+'}{formatAmount(net.amount)}
                </Text>
                <Text style={[styles.netStripLabel, { color: netColor.dim }]}>
                  {NET_LABELS[net.type]}
                </Text>
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
                      {payer.id === currentUserId ? `You (${payer.name})` : payer.name}
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
          {splitMembers.length > 1 && (
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
                            {m.id === currentUserId ? 'You' : m.name}
                          </Text>
                          {isPayer && (
                            <Text style={styles.payerTagText}>paid · settled</Text>
                          )}
                        </View>
                        <Text style={[styles.shareAmt, { color: shareColor }]}>
                          {isPayer ? '' : '−'}{formatAmount(perPerson)}
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
    fontFamily: fonts.dmSansSemiBold, fontSize: 12,
    fontWeight: '600', color: colors.text2,
  },
  actionBtnTextDelete: { color: colors.danger },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },

  hero: { alignItems: 'center', marginBottom: 20 },
  emojiCircle: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroEmoji: { fontSize: 38 },
  heroTitle: {
    fontFamily: fonts.syne, fontSize: 22, fontWeight: '800',
    color: colors.text, textAlign: 'center', marginBottom: 8,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroDate: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2 },
  heroSep: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text3 },
  catPill: {
    backgroundColor: colors.cardElevated, borderWidth: 1,
    borderColor: colors.borderEmphasis, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  catPillText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 11,
    fontWeight: '600', color: colors.text2,
  },

  amountCard: {
    backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderRadius: 22,
    overflow: 'hidden', marginBottom: 16,
  },
  amountRow: { flexDirection: 'row', padding: 20, paddingBottom: 16 },
  amountCol: { flex: 1, alignItems: 'center' },
  amountColDivider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },
  amountColLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 9, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text3, marginBottom: 4,
  },
  amountColValue: {
    fontFamily: fonts.syne, fontSize: 28, fontWeight: '800',
    letterSpacing: -1, color: colors.text, marginBottom: 2,
  },
  amountColSub: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3 },
  netStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border,
  },
  netStripSign: { fontFamily: fonts.syne, fontSize: 16, fontWeight: '800' },
  netStripLabel: { fontFamily: fonts.dmSans, fontSize: 12 },

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
  memberSub: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text2, marginTop: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  badgeGreen: { backgroundColor: colors.accentDim, borderColor: colors.accentMid },
  badgeDefault: { backgroundColor: colors.cardElevated, borderColor: colors.border },
  badgeText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600' },

  splitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11, gap: 10,
  },
  splitDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },
  payerTagText: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.accent, marginTop: 1 },
  shareAmt: { fontFamily: fonts.syne, fontSize: 14, fontWeight: '800', flexShrink: 0 },

  noteText: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text, lineHeight: 20 },

  entryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  entryMetaAvatar: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  entryMetaInitials: { fontFamily: fonts.dmSansSemiBold, fontSize: 8, fontWeight: '700' },
  entryMetaText: { flex: 1 },
  entryMetaLabel: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.text2 },
  entryMetaTime: { fontFamily: fonts.dmSans, fontSize: 10, color: colors.text3, marginTop: 1 },

  emptyComments: {
    fontFamily: fonts.dmSans, fontSize: 12, color: colors.text3,
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
