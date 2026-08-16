import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import BoltEmptyState from '../components/mascot/BoltEmptyState';

import type { NotificationData } from '../context/AppContext';

// ── Helpers ──
const isToday = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

const timeAgo = (dateString: string) => {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

type NotifType = NotificationData['type'];

const ICON_MAP: Record<NotifType, string> = {
  message: 'chatbubble-ellipses-outline',
  score: 'trophy-outline',
  water: 'water-outline',
  workout: 'barbell-outline',
  nutrition: 'nutrition-outline',
  file: 'document-text-outline',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, markNotificationRead, refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  // Snapshot which notifications were unread when the screen opened, so cards
  // keep their "new" styling for this visit even after we mark them read.
  const initialUnreadIds = useRef<Set<string>>(new Set(
    notifications.filter(n => !n.is_read).map(n => n.id)
  ));

  // Opening the screen marks everything read so the home bell badge clears.
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    Promise.all(unread.map(n => markNotificationRead(n.id))).catch(() => {});
  }, [notifications, markNotificationRead]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  const todayNotifs = notifications.filter(n => isToday(n.created_at));
  const pastNotifs = notifications.filter(n => !isToday(n.created_at));

  const handlePress = useCallback((item: NotificationData) => {
    if (!item.is_read) markNotificationRead(item.id).catch(() => {});
    const clientId = (item.metadata as any)?.client_id as string | undefined;
    if (item.type === 'message') {
      // Notifications carry a client id, not a conversation id — the messages
      // list is the reliable landing spot for chat threads.
      router.push('/(tabs)/messages' as any);
    } else if (clientId) {
      router.push(`/client/${clientId}` as any);
    }
  }, [markNotificationRead, router]);

  const renderNotification = (item: NotificationData) => {
    const icon = ICON_MAP[item.type] || 'notifications-outline';
    const meta = item.metadata || {};
    const isNew = initialUnreadIds.current.has(item.id);
    const clientId = (meta as any)?.client_id;
    const tappable = item.type === 'message' || !!clientId;

    return (
      <TouchableOpacity
        key={item.id}
        style={[st.notifCard, isNew && st.notifCardNew]}
        activeOpacity={tappable ? 0.75 : 1}
        onPress={() => handlePress(item)}
        disabled={!tappable}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${isNew ? ', new' : ''}: ${item.description}`}
      >
        {isNew && <View style={st.unreadDot} />}

        <View style={st.notifIcon}>
          <Ionicons name={icon as any} size={18} color={isNew ? CoachColors.accent : CoachColors.textSecondary} />
        </View>

        <View style={st.notifContent}>
          <View style={st.notifTopRow}>
            <Text style={st.notifTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={st.notifTime}>{timeAgo(item.created_at)}</Text>
          </View>

          <Text style={st.notifDesc} numberOfLines={2}>
            {item.type === 'message' && meta.messageCount
              ? `${meta.messageCount} new ${item.description}`
              : item.type === 'score' && meta.currentScore
                ? `${item.description} ${meta.currentScore}`
                : item.type === 'workout' && meta.workoutName
                  ? `${meta.workoutName} ${item.description}`
                  : item.type === 'water' && meta.waterRemaining
                    ? `${item.description} ${meta.waterRemaining} left.`
                    : item.description
            }
          </Text>

          {item.type === 'file' && meta.fileName && (
            <View style={st.fileRow}>
              <Ionicons name="document-attach-outline" size={13} color={CoachColors.textMuted} />
              <Text style={st.fileName} numberOfLines={1}>{meta.fileName}</Text>
            </View>
          )}
        </View>

        {item.type === 'score' && meta.scoreGained != null && (
          <View style={st.scorePill}>
            <Text style={st.scoreText}>+{meta.scoreGained}</Text>
          </View>
        )}
        {tappable && (
          <Ionicons name="chevron-forward" size={15} color={CoachColors.textFaint} style={{ marginLeft: 6, alignSelf: 'center' }} />
        )}
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, data: NotificationData[]) => {
    if (data.length === 0) return null;
    return (
      <View style={st.section}>
        <View style={st.sectionHeader}>
          <Text style={st.sectionTitle}>{title}</Text>
          <Text style={st.sectionCount}>{data.length}</Text>
        </View>
        {data.map(renderNotification)}
      </View>
    );
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity hitSlop={2} onPress={() => router.back()} style={st.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={CoachColors.textSecondary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />}
      >
        {notifications.length === 0 ? (
          <BoltEmptyState
            pose="analyze"
            title="Nothing yet"
            subtitle="Client activity lands here — new messages, completed workouts, score milestones and shared files."
          />
        ) : (
          <>
            {renderSection('Today', todayNotifs)}
            {renderSection('Earlier', pastNotifs)}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.textPrimary },

  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, paddingTop: 8,
  },
  sectionTitle: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11,
    color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  sectionCount: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint },

  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: CoachColors.surface,
    borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    position: 'relative',
  },
  notifCardNew: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: CoachColors.border,
  },
  unreadDot: {
    position: 'absolute', top: 14, left: 5,
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: CoachColors.accent,
  },

  notifIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },

  notifContent: { flex: 1, marginLeft: 12, gap: 3 },
  notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notifTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary, flex: 1 },
  notifTime: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint },
  notifDesc: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary, lineHeight: 18 },

  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: CoachColors.bg, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, marginTop: 7,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  fileName: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textSecondary, flex: 1 },

  scorePill: {
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    marginLeft: 8, alignSelf: 'center',
  },
  scoreText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 12, color: CoachColors.accent },

  emptyState: { alignItems: 'center', paddingVertical: 100, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },
  emptySubtitle: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted,
    textAlign: 'center', lineHeight: 20,
  },
});
