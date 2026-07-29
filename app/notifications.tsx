import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';

import type { NotificationData } from '../context/AppContext';

const { width: SCREEN_W } = Dimensions.get('window');

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

const ICON_MAP: Record<NotifType, { icon: string; color: string }> = {
  message: { icon: 'chatbubble-ellipses', color: '#6C9BF2' },
  score: { icon: 'trophy', color: '#FBBF24' },
  water: { icon: 'water', color: '#38BDF8' },
  workout: { icon: 'barbell', color: '#22C55E' },
  nutrition: { icon: 'nutrition', color: '#A78BFA' },
  file: { icon: 'document-text', color: '#F87171' },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trainer, notifications, markNotificationRead, refreshData } = useApp();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Group notifications
  const todayNotifs = notifications.filter(n => isToday(n.created_at));
  const pastNotifs = notifications.filter(n => !isToday(n.created_at));
  const unreadNotifs = notifications.filter(n => !n.is_read);

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.is_read);
    for (const n of unread) {
      await markNotificationRead(n.id);
    }
  }, [notifications, markNotificationRead]);

  const renderNotification = (item: NotificationData) => {
    const config = ICON_MAP[item.type] || { icon: 'notifications', color: '#6B7280' };
    const meta = item.metadata || {};

    return (
      <TouchableOpacity
        key={item.id}
        style={[st.notifCard, !item.is_read && st.notifCardUnread]}
        activeOpacity={0.75}
        onPress={() => markNotificationRead(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${!item.is_read ? ', unread' : ''}: ${item.description}`}
      >
        {/* Unread indicator */}
        {!item.is_read && <View style={[st.unreadDot, { backgroundColor: config.color }]} />}

        {/* Icon */}
        <View style={[st.notifIcon, { backgroundColor: config.color + '15' }]}>
          <Ionicons name={config.icon as any} size={20} color={config.color} />
          {item.type === 'message' && meta.messageCount && (
            <View style={[st.iconBadge, { backgroundColor: config.color }]}>
              <Text style={st.iconBadgeText}>{meta.messageCount}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={st.notifContent}>
          <View style={st.notifTopRow}>
            <Text style={st.notifTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={st.notifTime}>{timeAgo(item.created_at)}</Text>
          </View>

          {/* Description with rich formatting */}
          <Text style={st.notifDesc} numberOfLines={2}>
            {item.type === 'message' && meta.messageCount
              ? `${meta.messageCount} new ${item.description}`
              : item.type === 'score'
                ? `${item.description} ${meta.currentScore || ''}`
                : item.type === 'workout' && meta.workoutName
                  ? `${meta.workoutName} ${item.description}`
                  : item.type === 'water' && meta.waterRemaining
                    ? `${item.description} ${meta.waterRemaining} left.`
                    : item.description
            }
          </Text>

          {/* Water progress bar */}
          {item.type === 'water' && meta.waterProgress != null && (
            <View style={st.waterBar}>
              <View style={[st.waterFill, { width: `${Math.min(meta.waterProgress * 100, 100)}%` }]} />
            </View>
          )}

          {/* File download */}
          {item.type === 'file' && meta.fileName && (
            <View style={st.fileRow}>
              <Ionicons name="document-attach" size={14} color="rgba(255,255,255,0.4)" />
              <Text style={st.fileName}>{meta.fileName}</Text>
              <Ionicons name="download-outline" size={14} color="#FF6B35" />
            </View>
          )}
        </View>

        {/* Right accessories */}
        {item.type === 'score' && meta.scoreGained && (
          <View style={st.scorePill}>
            <Text style={st.scoreText}>+{meta.scoreGained}</Text>
          </View>
        )}
        {item.type === 'workout' && item.is_read && (
          <View style={[st.statusDot, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
            <Ionicons name="checkmark" size={14} color="#22C55E" />
          </View>
        )}
        {item.type === 'nutrition' && meta.nutritionProgress != null && (
          <View style={st.nutritionRing}>
            <Text style={st.nutritionText}>{meta.nutritionProgress}%</Text>
          </View>
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

  const showingData = activeTab === 'unread' ? unreadNotifs : notifications;

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Text style={st.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={st.headerBadge}>
              <Text style={st.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={st.markAllBtn} accessibilityRole="button" accessibilityLabel="Mark all as read">
            <Ionicons name="checkmark-done" size={20} color="#FF6B35" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* ── TABS ── */}
      <View style={st.tabs}>
        {(['all', 'unread'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[st.tab, activeTab === tab && st.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>
              {tab === 'all' ? 'All' : 'Unread'}
            </Text>
            {tab === 'unread' && unreadCount > 0 && (
              <View style={st.tabBadge}>
                <Text style={st.tabBadgeText}>{Math.min(unreadCount, 99)}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── CONTENT ── */}
      <ScrollView
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
      >
        {showingData.length === 0 ? (
          <View style={st.emptyState}>
            <View style={st.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={40} color="rgba(255,255,255,0.1)" />
            </View>
            <Text style={st.emptyTitle}>
              {activeTab === 'unread' ? 'All caught up!' : 'No notifications yet'}
            </Text>
            <Text style={st.emptySubtitle}>
              {activeTab === 'unread'
                ? "You've read all your notifications"
                : 'New notifications will appear here'}
            </Text>
          </View>
        ) : activeTab === 'unread' ? (
          // Unread tab: flat list
          <View style={st.section}>
            {unreadNotifs.map(renderNotification)}
          </View>
        ) : (
          // All tab: grouped by today/past
          <>
            {renderSection('Today', todayNotifs)}
            {renderSection('Earlier', pastNotifs)}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  headerBadge: {
    backgroundColor: '#FF6B35',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  markAllBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 4,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
  },
  tabTextActive: { color: '#FFFFFF' },
  tabBadge: {
    backgroundColor: '#FF6B35',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },

  // Content
  scrollContent: { paddingHorizontal: Spacing.lg },

  // Sections
  section: { marginBottom: Spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingTop: 8,
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },

  // Notification Card
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    position: 'relative',
  },
  notifCardUnread: {
    backgroundColor: 'rgba(255,107,53,0.04)',
    borderColor: 'rgba(255,107,53,0.1)',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 6,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Icon
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  iconBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#FFFFFF',
  },

  // Content
  notifContent: {
    flex: 1,
    marginLeft: 12,
    gap: 3,
  },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  notifTime: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
  },
  notifDesc: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 18,
  },

  // Water progress
  waterBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  waterFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 2,
  },

  // File
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  fileName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
  },

  // Right accessories
  scorePill: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    marginLeft: 8,
  },
  scoreText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 12,
    color: '#FBBF24',
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  nutritionRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#A78BFA',
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderRightColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  nutritionText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#A78BFA',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 100,
    gap: 10,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
  },
});
