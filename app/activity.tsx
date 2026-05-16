import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { formatAmount } from '@/constants/amountUtils';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import { useActivity, useMarkRead, useMarkAllRead, useUnreadCount } from '@/hooks/useActivity';
import { useGroups } from '@/hooks/useGroups';
import type { Activity, AvatarColor } from '@/types/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isThisWeek(iso: string): boolean {
  if (isToday(iso)) return false;
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function eventTitle(row: Activity, actorName: string, isActor: boolean): string {
  const meta = (row.meta ?? {}) as Record<string, any>;
  switch (row.type) {
    case 'expense_added':    return `${actorName} added ${meta.title ?? 'an expense'}`;
    case 'expense_edited':   return `${actorName} updated ${meta.title ?? 'an expense'}`;
    case 'expense_deleted':  return `${actorName} deleted ${meta.title ?? 'an expense'}`;
    case 'settlement_received':
      return isActor ? `${actorName} settled up` : `${actorName} settled up with you`;
    case 'comment_added':    return `${actorName} commented on ${meta.expense_title ?? 'an expense'}`;
    default:                 return `${actorName} did something`;
  }
}

function eventSub(row: Activity, groupLabel: string, _isActor?: boolean): string {
  const meta = (row.meta ?? {}) as Record<string, any>;
  switch (row.type) {
    case 'expense_added':
      return meta.amount != null
        ? `${formatAmount(meta.amount)} · ${groupLabel}`
        : groupLabel;
    case 'expense_edited':
      return meta.old_amount != null && meta.amount != null
        ? `${formatAmount(meta.old_amount)} → ${formatAmount(meta.amount)} · ${groupLabel}`
        : groupLabel;
    case 'settlement_received':
      return meta.amount != null
        ? `${formatAmount(meta.amount)} · ${groupLabel}`
        : groupLabel;
    case 'comment_added':
      return meta.comment_text ? String(meta.comment_text) : groupLabel;
    default:
      return groupLabel;
  }
}

function routeForRow(row: Activity): string {
  switch (row.type) {
    case 'expense_added':
    case 'expense_edited':
    case 'comment_added':
      return row.ref_id ? `/expense/${row.ref_id}` : '/';
    case 'settlement_received':
      return '/(tabs)/settle';
    default:
      return '/';
  }
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

const AV_COLORS: AvatarColor[] = ['green', 'blue', 'purple', 'orange'];

function colorForActor(actorId: string): AvatarColor {
  let h = 0;
  for (let i = 0; i < actorId.length; i++) h = (h * 31 + actorId.charCodeAt(i)) | 0;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Components ──────────────────────────────────────────────────────────────

interface ActivityRowProps {
  row: Activity;
  actorName: string;
  groupLabel: string;
  isActor: boolean;
  onPress: () => void;
}

function ActivityItem({ row, actorName, groupLabel, isActor, onPress }: ActivityRowProps) {
  const color = colorForActor(row.actor_id);
  const av = avatarColors[color] ?? avatarColors.green;
  const ini = initials(actorName);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: av.bg }]}>
        <Text style={[styles.avatarText, { color: av.text }]}>{ini}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{eventTitle(row, actorName, isActor)}</Text>
        {!!eventSub(row, groupLabel, isActor) && (
          <Text style={styles.rowSub} numberOfLines={1}>{eventSub(row, groupLabel, isActor)}</Text>
        )}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowTime}>{relativeTime(row.created_at)}</Text>
        {!row.read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const router = useRouter();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const { data: activities = [], isLoading, refetch } = useActivity(currentUserId);
  const { data: unreadCount = 0 } = useUnreadCount(currentUserId);
  const { data: groups = [] } = useGroups(currentUserId);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  // Refetch when the screen comes into focus — catches events that landed
  // while the screen was off-stack (realtime only fires when subscribed).
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Group name lookup
  const groupMap = new Map(groups.map(g => [g.id, `${g.cover_emoji} ${g.name}`]));

  const handlePress = useCallback((row: Activity) => {
    if (!row.read) markRead.mutate({ id: row.id, userId: currentUserId });
    router.push(routeForRow(row) as never);
  }, [markRead, currentUserId, router]);

  // Split into buckets
  const today    = activities.filter(a => isToday(a.created_at));
  const thisWeek = activities.filter(a => isThisWeek(a.created_at));
  const earlier  = activities.filter(a => !isToday(a.created_at) && !isThisWeek(a.created_at));

  const renderRow = (row: Activity) => {
    const meta = (row.meta ?? {}) as Record<string, any>;
    const isActor = row.actor_id === currentUserId;
    const actorName = isActor ? 'You' : (meta.actor_name ?? 'Someone');
    const groupLabel = row.group_id ? (groupMap.get(row.group_id) ?? '') : '';
    return (
      <ActivityItem
        key={row.id}
        row={row}
        actorName={actorName}
        groupLabel={groupLabel}
        isActor={isActor}
        onPress={() => handlePress(row)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Activity</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={() => markAllRead.mutate(currentUserId)}
            activeOpacity={0.7}
          >
            <Text style={styles.markAllBtn}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && activities.length === 0 && (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        )}

        {!isLoading && activities.length === 0 && (
          <Text style={styles.empty}>No activity yet{'\n'}Add an expense to get started</Text>
        )}

        {today.length > 0 && (
          <>
            <Text style={styles.section}>TODAY</Text>
            <View style={styles.card}>{today.map(renderRow)}</View>
          </>
        )}

        {thisWeek.length > 0 && (
          <>
            <Text style={styles.section}>THIS WEEK</Text>
            <View style={styles.card}>{thisWeek.map(renderRow)}</View>
          </>
        )}

        {earlier.length > 0 && (
          <>
            <Text style={styles.section}>EARLIER</Text>
            <View style={styles.card}>{earlier.map(renderRow)}</View>
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
  content: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },

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
  markAllBtn: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    width: 80,
    textAlign: 'right',
  },

  section: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.text2,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: fonts.dmSansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  rowSub: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    color: colors.text2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 8,
    flexShrink: 0,
  },
  rowTime: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    color: colors.text2,
  },
  unreadDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.accent,
  },

  empty: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: colors.text3,
    textAlign: 'center',
    marginTop: 60,
    lineHeight: 22,
  },
});
