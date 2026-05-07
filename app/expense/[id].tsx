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
import { formatAmount, formatDisplayName } from '@/constants/amountUtils';
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

const NET_COLORS: Record<NetType, { main: string; dim: string; bg: string; border: string }> = {
  lent:     { main: colors.accent, dim: 'rgba(0,212,154,0.70)',  bg: 'rgba(0,212,154,0.10)',  border: 'rgba(0,212,154,0.25)'  },
  owed:     { main: colors.danger, dim: 'rgba(255,89,89,0.70)',  bg: 'rgba(255,89,89,0.10)',  border: 'rgba(255,89,89,0.25)'  },
  personal: { main: colors.text,   dim: colors.text2,            bg: 'transparent',            border: 'transparent'           },
};

const NET_LABELS: Record<NetType, string> = {
  lent: 'you lent', owed: 'you owe', personal: '',
};

// ─── Comment bubble ───────────────────────────────────────────────────────────

function CommentBubble({
  comment, memberMap, currentUserId,
}: {
  comment: ExpenseComment;
  memberMap: Map<string, User>;
  currentUserId: string;
}) {
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
  messageText: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text, lineHeight: 18 },
  timestamp: { fontFamily: fonts.dmSans, fontSize: 11, color: colors.text3, marginTop: 4, textAlign: 'right' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const groupId = useGroupStore(s => s.currentGroupId);
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  const { data: expense, isLoading } = useExpense(id);
  const { data: members = [] } = useMembers(expense?.group_id ?? groupId);
  const deleteExpense = useDeleteExpense();
  const addComment = useAddComment();

  const scrollRef = useRef<ScrollView>(null);
  const [commentText, setCommentText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (isLoading && !expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.text2} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centred}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.notFoundText}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const memberMap = new Map<string, User>(members.map(m => [m.id, m]));
  const category = expense.category ? categories.find(c => c.id === expense.category) : null;
  const emoji = category?.emoji ?? '📦';
  const payer = expense.paid_by ? memberMap.get(expense.paid_by) : null;
  const adder = expense.added_by ? memberMap.get(expense.added_by) : null;

  const splits = expense.splits ?? [];
  const splitMembers = splits.map(s => memberMap.get(s.user_id)).filter((m): m is User => !!m);
  const nonPayerMembers = splitMembers.filter(m => m.id !== expense.paid_by);

  const perPerson = splits.length > 0
    ? parseFloat((expense.amount / splits.length).toFixed(2))
    : expense.amount;

  const isPersonal = splitMembers.length <= 1;
  const isYouPaid = expense.paid_by === currentUserId;

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

  const avFor = (m: User) => avatarColors[(m.avatar_color ?? 'green') as AvatarColor] ?? avatarColors.green;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    deleteExpense.mutate(
      { expenseId: expense.id, groupId: expense.group_id },
      { onSuccess: () => router.back() },
    );
  };

  const handleSend = () => {
    const text = commentText.trim();
    if (!text) return;
    addComment.mutate(
      { expenseId: expense.id, groupId: expense.group_id, userId: currentUserId, text },
      {
        onSuccess: () => {
          setCommentText('');
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Expense</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/expense/edit/${expense.id}` as never)}
            >
              <Ionicons name="pencil-outline" size={14} color={colors.text2} />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, deleteConfirm ? styles.actionBtnDanger : styles.actionBtnDelete]}
              onPress={handleDelete}
              disabled={deleteExpense.isPending}
            >
              <Ionicons
                name={deleteConfirm ? 'warning-outline' : 'trash-outline'}
                size={14}
                color={colors.danger}
              />
              <Text style={[styles.actionBtnText, { color: colors.danger }]}>
                {deleteConfirm ? 'Confirm?' : 'Delete'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Hero card ────────────────────────────────────────────────── */}
          <View style={styles.heroCard}>
            {/* Emoji + title */}
            <View style={styles.heroTop}>
              <View style={styles.emojiCircle}>
                <Text style={styles.heroEmoji}>{emoji}</Text>
              </View>
              <Text style={styles.heroTitle}>{expense.title}</Text>
              {category && (
                <View style={styles.catChip}>
                  <Text style={styles.catChipText}>{category.label}</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={styles.heroDivider} />

            {/* Amount + net badge */}
            <View style={styles.heroAmountRow}>
              <View style={styles.heroAmountBlock}>
                <Text style={styles.heroAmountLabel}>TOTAL AMOUNT</Text>
                <Text style={styles.heroAmount}>{formatAmount(expense.amount)}</Text>
                {!isPersonal && (
                  <Text style={styles.heroAmountSub}>
                    {formatAmount(perPerson)} × {splitMembers.length} people
                  </Text>
                )}
              </View>
              {net.type !== 'personal' && (
                <View style={[styles.netBadge, { backgroundColor: netColor.bg, borderColor: netColor.border }]}>
                  <Text style={[styles.netBadgeAmt, { color: netColor.main }]}>
                    {net.type === 'owed' ? '−' : '+'}{formatAmount(net.amount)}
                  </Text>
                  <Text style={[styles.netBadgeLabel, { color: netColor.dim }]}>
                    {NET_LABELS[net.type]}
                  </Text>
                </View>
              )}
            </View>

            {/* Meta: date · added by */}
            <View style={styles.heroMeta}>
              <Ionicons name="calendar-outline" size={12} color={colors.text3} />
              <Text style={styles.heroMetaText}>{createdFmt?.date ?? ''}</Text>
              {adder && (
                <>
                  <Text style={styles.heroMetaDot}>·</Text>
                  <View style={[styles.heroMetaAvatar, { backgroundColor: avFor(adder).bg }]}>
                    <Text style={[styles.heroMetaInitials, { color: avFor(adder).text }]}>
                      {initialsFromName(adder.name)}
                    </Text>
                  </View>
                  <Text style={styles.heroMetaText}>
                    by {adder.id === currentUserId ? 'you' : formatDisplayName(adder.name)}
                  </Text>
                </>
              )}
              {updatedFmt && (
                <>
                  <Text style={styles.heroMetaDot}>·</Text>
                  <Ionicons name="pencil-outline" size={11} color={colors.text3} />
                  <Text style={styles.heroMetaText}>edited</Text>
                </>
              )}
            </View>
          </View>

          {/* ── Participants ─────────────────────────────────────────────── */}
          {(payer || splitMembers.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {isPersonal ? 'PAID BY' : 'PARTICIPANTS'}
              </Text>
              <View style={styles.card}>

                {/* Payer row */}
                {payer && (
                  <View style={styles.participantRow}>
                    <View style={[styles.avatar, { backgroundColor: avFor(payer).bg }]}>
                      <Text style={[styles.avatarText, { color: avFor(payer).text }]}>
                        {initialsFromName(payer.name)}
                      </Text>
                    </View>
                    <View style={styles.participantInfo}>
                      <Text style={styles.participantName}>
                        {payer.id === currentUserId ? 'You' : formatDisplayName(payer.name)}
                      </Text>
                      <Text style={styles.participantSub}>
                        {isPersonal ? 'personal expense' : 'paid the bill'}
                      </Text>
                    </View>
                    <View style={styles.participantRight}>
                      <Text style={[styles.participantAmt, { color: colors.accent }]}>
                        {formatAmount(expense.amount)}
                      </Text>
                      <View style={styles.paidTag}>
                        <Text style={styles.paidTagText}>paid ✓</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Non-payer split members */}
                {nonPayerMembers.map((m, i) => {
                  const isMe = m.id === currentUserId;
                  const amtColor = isYouPaid
                    ? colors.danger
                    : isMe ? colors.danger : colors.text2;
                  return (
                    <View key={m.id}>
                      <View style={styles.participantDivider} />
                      <View style={styles.participantRow}>
                        <View style={[styles.avatar, { backgroundColor: avFor(m).bg }]}>
                          <Text style={[styles.avatarText, { color: avFor(m).text }]}>
                            {initialsFromName(m.name)}
                          </Text>
                        </View>
                        <View style={styles.participantInfo}>
                          <Text style={styles.participantName}>
                            {isMe ? 'You' : formatDisplayName(m.name)}
                          </Text>
                          <Text style={styles.participantSub}>owes share</Text>
                        </View>
                        <Text style={[styles.participantAmt, { color: amtColor }]}>
                          −{formatAmount(perPerson)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Note ─────────────────────────────────────────────────────── */}
          {expense.note && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTE</Text>
              <View style={styles.card}>
                <Text style={styles.noteText}>{expense.note}</Text>
              </View>
            </View>
          )}

          {/* ── Comments ─────────────────────────────────────────────────── */}
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
                    <CommentBubble
                      key={c.id}
                      comment={c}
                      memberMap={memberMap}
                      currentUserId={currentUserId}
                    />
                  ))}
              </View>
            )}
          </View>

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* ── Comment input ─────────────────────────────────────────────── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  notFoundText: {
    fontFamily: fonts.dmSans, fontSize: 14, color: colors.text2, textAlign: 'center', marginTop: 16,
  },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: fonts.syne, fontSize: 17, color: colors.text,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    backgroundColor: colors.cardElevated,
  },
  actionBtnDelete: {
    borderColor: 'rgba(255,89,89,0.25)', backgroundColor: 'rgba(255,89,89,0.08)',
  },
  actionBtnDanger: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  actionBtnText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '600', color: colors.text2 },

  // ── Scroll
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },

  // ── Hero card
  heroCard: {
    backgroundColor: colors.card, borderRadius: 24,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 16, overflow: 'hidden',
  },
  heroTop: { alignItems: 'center', paddingTop: 28, paddingBottom: 22, paddingHorizontal: 20 },
  emojiCircle: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroEmoji: { fontSize: 34 },
  heroTitle: {
    fontFamily: fonts.syne, fontSize: 20, fontWeight: '800',
    color: colors.text, textAlign: 'center', marginBottom: 8, lineHeight: 26,
  },
  catChip: {
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  catChipText: { fontFamily: fonts.dmSansSemiBold, fontSize: 12, fontWeight: '600', color: colors.text2 },

  heroDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 0 },

  heroAmountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  heroAmountBlock: {},
  heroAmountLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text3, marginBottom: 4,
  },
  heroAmount: {
    fontFamily: fonts.syne, fontSize: 36, fontWeight: '800',
    letterSpacing: -1.5, color: colors.text,
  },
  heroAmountSub: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2, marginTop: 3 },

  netBadge: {
    alignItems: 'center', borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10, minWidth: 90,
  },
  netBadgeAmt: { fontFamily: fonts.syne, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  netBadgeLabel: { fontFamily: fonts.dmSans, fontSize: 11, marginTop: 2 },

  heroDivider2: { height: 1, backgroundColor: colors.border },
  heroMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  heroMetaText: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2 },
  heroMetaDot: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text3 },
  heroMetaAvatar: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  heroMetaInitials: { fontFamily: fonts.dmSansSemiBold, fontSize: 9, fontWeight: '700' },

  // ── Sections
  section: { marginBottom: 14 },
  sectionLabel: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.text2, marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderRadius: 20,
    overflow: 'hidden',
  },

  // ── Participants
  participantRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  participantDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: fonts.dmSansSemiBold, fontSize: 13, fontWeight: '700' },
  participantInfo: { flex: 1 },
  participantName: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 14, fontWeight: '600', color: colors.text,
  },
  participantSub: { fontFamily: fonts.dmSans, fontSize: 12, color: colors.text2, marginTop: 2 },
  participantRight: { alignItems: 'flex-end', gap: 4 },
  participantAmt: { fontFamily: fonts.syne, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  paidTag: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentMid,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  paidTagText: { fontFamily: fonts.dmSansSemiBold, fontSize: 11, fontWeight: '600', color: colors.accent },

  // ── Note
  noteText: { fontFamily: fonts.dmSans, fontSize: 13, color: colors.text, lineHeight: 20, padding: 14 },

  // ── Comments
  emptyComments: {
    fontFamily: fonts.dmSans, fontSize: 13, color: colors.text3,
    textAlign: 'center', paddingVertical: 20,
  },
  commentsList: { gap: 0 },

  // ── Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 14,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  inputField: {
    flex: 1, backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.borderEmphasis,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: fonts.dmSans, fontSize: 13, color: colors.text, maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderEmphasis,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sendBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sendBtnText: { fontSize: 16, color: colors.text3, fontWeight: '700' },
  sendBtnTextActive: { color: '#000' },
});
