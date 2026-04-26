import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { members, categories } from '@/constants/sampleData';
import type { Expense, ExpenseComment } from '@/constants/sampleData';
import { useAppContext } from '@/context/AppContext';
import { formatAmount } from '@/constants/amountUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NetType = 'lent' | 'owed' | 'received' | 'personal';

function getNetBalance(exp: Expense, perPerson: number): { type: NetType; amount: number } {
  if (exp.isIncome) return { type: 'received', amount: exp.amount };
  const split = exp.splitWith;
  if (!split || split.length <= 1) return { type: 'personal', amount: exp.amount };
  if (exp.paidBy === 'aryan') return { type: 'lent', amount: exp.amount - perPerson };
  return { type: 'owed', amount: perPerson };
}

const NET_COLORS: Record<NetType, { main: string; dim: string; bg: string }> = {
  lent:     { main: colors.accent, dim: 'rgba(0,212,154,0.60)', bg: colors.accentDim },
  received: { main: colors.accent, dim: 'rgba(0,212,154,0.60)', bg: colors.accentDim },
  owed:     { main: colors.danger, dim: 'rgba(255,89,89,0.60)', bg: colors.dangerDim },
  personal: { main: colors.text,   dim: colors.text2,           bg: 'transparent'    },
};

const NET_LABELS: Record<NetType, string> = {
  lent: 'you lent', received: 'you received', owed: 'you owe', personal: '',
};

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  return { date, time };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).toUpperCase();
}

// ─── Comment bubble ───────────────────────────────────────────────────────────

function CommentBubble({ comment }: { comment: ExpenseComment }) {
  const isMe = comment.memberId === 'aryan';
  const member = members.find(m => m.id === comment.memberId);
  if (!member) return null;

  return (
    <View style={[bubbleStyles.row, isMe && bubbleStyles.rowReverse]}>
      {!isMe && (
        <View style={[bubbleStyles.avatar, { backgroundColor: avatarColors[member.color].bg }]}>
          <Text style={[bubbleStyles.avatarText, { color: avatarColors[member.color].text }]}>
            {member.initials}
          </Text>
        </View>
      )}
      <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem]}>
        {!isMe && (
          <Text style={bubbleStyles.senderName}>{member.name}</Text>
        )}
        <Text style={[bubbleStyles.messageText, isMe && { color: '#000' }]}>
          {comment.text}
        </Text>
        <Text style={[bubbleStyles.timestamp, isMe && { color: 'rgba(0,0,0,0.5)' }]}>
          {formatTime(comment.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 9,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '72%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleThem: {
    backgroundColor: colors.cardElevated,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text2,
    marginBottom: 3,
  },
  messageText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  timestamp: {
    fontFamily: fonts.dmSans,
    fontSize: 9,
    color: colors.text3,
    marginTop: 4,
    textAlign: 'right',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { expenses, deleteExpense, addComment } = useAppContext();
  const scrollRef = useRef<ScrollView>(null);
  const [commentText, setCommentText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expense = expenses.find(e => e.id === id);

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.notFound}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.notFoundText}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const category = expense.category ? categories.find(c => c.id === expense.category) : null;
  const payer = expense.paidBy ? members.find(m => m.id === expense.paidBy) : null;
  const adder = expense.addedBy ? members.find(m => m.id === expense.addedBy) : null;

  const splitMembers = (expense.splitWith ?? [])
    .map(mid => members.find(m => m.id === mid))
    .filter((m): m is typeof members[0] => !!m);

  const perPerson = splitMembers.length > 0
    ? parseFloat((expense.amount / splitMembers.length).toFixed(2))
    : expense.amount;

  const isPersonal = splitMembers.length <= 1;
  const isYouPaid = expense.paidBy === 'aryan';

  const net = getNetBalance(expense, perPerson);
  const netColor = NET_COLORS[net.type];
  const createdFmt = expense.createdAt ? formatDateTime(expense.createdAt) : null;
  const updatedFmt = expense.updatedAt ? formatDateTime(expense.updatedAt) : null;
  const comments = expense.comments ?? [];

  // ── Handlers ──

  const handleDelete = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    deleteExpense(expense.id);
    router.back();
  };

  const handleSend = () => {
    const text = commentText.trim();
    if (!text) return;
    addComment(expense.id, {
      id: Date.now().toString(),
      memberId: 'aryan',
      text,
      createdAt: new Date().toISOString(),
    });
    setCommentText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* ── Fixed header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
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

        {/* ── Scrollable detail + comments ── */}
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
              <Text style={styles.heroEmoji}>{expense.emoji}</Text>
            </View>
            <Text style={styles.heroTitle}>{expense.title}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.heroDate}>{expense.date}</Text>
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

          {/* Entry details — who added it and when */}
          {(createdFmt || adder) && (
            <View style={styles.entryMetaRow}>
              {adder && (
                <View style={[styles.entryMetaAvatar, { backgroundColor: avatarColors[adder.color].bg }]}>
                  <Text style={[styles.entryMetaInitials, { color: avatarColors[adder.color].text }]}>
                    {adder.initials}
                  </Text>
                </View>
              )}
              <View style={styles.entryMetaText}>
                {adder && (
                  <Text style={styles.entryMetaLabel}>
                    Added by {adder.id === 'aryan' ? 'you' : adder.name}
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
                  <View style={[styles.avatar, { backgroundColor: avatarColors[payer.color].bg }]}>
                    <Text style={[styles.avatarText, { color: avatarColors[payer.color].text }]}>
                      {payer.initials}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {payer.id === 'aryan' ? 'You (Aryan)' : payer.name}
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
                  const isPayer = m.id === expense.paidBy;
                  const shareColor = isPayer
                    ? colors.text2
                    : (isYouPaid || m.id === 'aryan') ? colors.danger : colors.text2;
                  return (
                    <View key={m.id}>
                      <View style={styles.splitRow}>
                        <View style={[styles.avatar, { backgroundColor: avatarColors[m.color].bg }]}>
                          <Text style={[styles.avatarText, { color: avatarColors[m.color].text }]}>
                            {m.initials}
                          </Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>
                            {m.id === 'aryan' ? 'You' : m.name}
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
                {comments.map(c => (
                  <CommentBubble key={c.id} comment={c} />
                ))}
              </View>
            )}
          </View>

          {/* Bottom padding so last bubble clears the input bar */}
          <View style={{ height: 8 }} />
        </ScrollView>

        {/* ── Pinned comment input ── */}
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
          />
          <TouchableOpacity
            style={[styles.sendBtn, commentText.trim().length > 0 && styles.sendBtnActive]}
            onPress={handleSend}
            activeOpacity={0.75}
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
  notFound: { flex: 1, paddingHorizontal: 22, paddingTop: 16 },
  notFoundText: {
    fontFamily: fonts.dmSans, fontSize: 14, color: colors.text2,
    textAlign: 'center', marginTop: 60,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backText: {
    fontFamily: fonts.dmSansSemiBold, fontSize: 14,
    fontWeight: '600', color: colors.accent,
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
  actionBtnTextDanger: { color: colors.danger, fontWeight: '700' },

  // Scroll
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Hero
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

  // Amount card
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

  // Shared
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

  // Member rows
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

  // Entry meta (compact inline row below hero)
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

  // Comments
  emptyComments: {
    fontFamily: fonts.dmSans, fontSize: 12, color: colors.text3,
    textAlign: 'center', paddingVertical: 20,
  },
  commentsList: { gap: 0 },

  // Input bar
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
  sendBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sendBtnText: {
    fontSize: 16,
    color: colors.text3,
    fontWeight: '700',
  },
  sendBtnTextActive: {
    color: '#000',
  },
});
