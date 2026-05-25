import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');

import type { NotificationData } from '../context/AppContext';

// Helper to determine if a date is today
const isToday = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

const getIconConfig = (type: NotificationData['type'], colors: ThemeColors) => {
  switch (type) {
    case 'message': return { iconBg: colors.textTertiary, iconName: 'chatbox-ellipses' as const };
    case 'score': return { iconBg: colors.yellow, iconName: 'add' as const };
    case 'water': return { iconBg: colors.blue, iconName: 'water' as const };
    case 'workout': return { iconBg: colors.green, iconName: 'barbell' as const };
    case 'nutrition': return { iconBg: colors.purple, iconName: 'nutrition' as const };
    case 'file': return { iconBg: colors.red, iconName: 'document-text' as const };
    default: return { iconBg: colors.textTertiary, iconName: 'notifications' as const };
  }
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trainer, notifications, markNotificationRead, refreshData } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<'Today' | 'Past'>('Today');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const todayNotifications = notifications.filter(n => isToday(n.created_at));
  const pastNotifications = notifications.filter(n => !isToday(n.created_at));

  const activeData = activeTab === 'Today' ? todayNotifications : pastNotifications;

  const renderNotification = (item: NotificationData) => {
    const { iconBg, iconName } = getIconConfig(item.type, colors);
    const meta = item.metadata || {};

    // Parse rich descriptions based on type (for demonstration, using simple text replace if complex)
    // In a real app with static strings, we just render item.description.
    // If we want bold parts like the mock, we would parse it. For now we just render it directly.
    const renderDescription = () => {
      if (item.type === 'message') return <Text><Text style={{fontFamily: FontFamily.bodySemiBold, color: colors.textSecondary}}>{meta.messageCount || 0} new</Text> {item.description}</Text>;
      if (item.type === 'score') return <Text>{item.description} <Text style={{fontFamily: FontFamily.bodySemiBold, color: colors.textSecondary}}>{meta.currentScore || ''}</Text></Text>;
      if (item.type === 'water') return <Text>{item.description} <Text style={{fontFamily: FontFamily.bodySemiBold, color: colors.textSecondary}}>{meta.waterRemaining || ''}</Text> left.</Text>;
      if (item.type === 'workout') return <Text><Text style={{fontFamily: FontFamily.bodySemiBold, color: colors.textSecondary}}>{meta.workoutName || 'Client'}</Text> {item.description}</Text>;
      return <Text>{item.description}</Text>;
    };

    return (
      <TouchableOpacity 
        key={item.id} 
        style={[styles.card, !item.is_read && { borderWidth: 1, borderColor: `${colors.accent}33`, backgroundColor: colors.accentSoft }]}
        activeOpacity={0.8}
        onPress={() => markNotificationRead(item.id)}
      >
        <View style={styles.cardHeader}>
          {/* Icon Wrap */}
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={24} color={colors.white} />
            {item.type === 'message' && meta.messageCount && (
              <View style={styles.iconBadge}>
                <Text style={styles.iconBadgeText}>{meta.messageCount}</Text>
              </View>
            )}
          </View>

          {/* Text Content */}
          <View style={styles.textContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
               <Text style={styles.cardTitle}>{item.title}</Text>
               {!item.is_read && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 2 }} />}
            </View>
            
            {item.type !== 'water' && item.type !== 'file' && (
               <Text style={styles.cardDesc}>{renderDescription()}</Text>
            )}
            
            {/* Water specific layout */}
            {item.type === 'water' && (
              <View style={styles.waterContainer}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(meta.waterProgress || 0) * 100}%` }]} />
                </View>
                <Text style={styles.cardDesc}>{renderDescription()}</Text>
              </View>
            )}
          </View>

          {/* Right Side Accessories */}
          {item.type === 'score' && (
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>+{meta.scoreGained || 0}</Text>
            </View>
          )}
          {item.type === 'workout' && (
            <View style={styles.checkIconWrap}>
              <Ionicons name="checkmark" size={16} color={colors.white} />
            </View>
          )}
          {item.type === 'nutrition' && (
            <View style={styles.circularProgressWrap}>
              <View style={[styles.circularProgressOuter, { borderColor: iconBg }]}>
                 <Text style={styles.circularProgressText}>{meta.nutritionProgress || 0}%</Text>
              </View>
            </View>
          )}
        </View>

        {/* File specific bottom area */}
        {item.type === 'file' && (
          <View style={styles.fileContainer}>
            <Text style={styles.cardDesc}>{item.description}</Text>
            <TouchableOpacity style={styles.fileBtn}>
              <Text style={styles.fileBtnText}>{meta.fileName}</Text>
              <Ionicons name="download-outline" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header Section (Dark) */}
      <View style={[styles.headerContainer, { backgroundColor: colors.headerBg, paddingTop: insets.top || Spacing.xl }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          
          <View style={{ flex: 1 }} />
          
          <Avatar name={trainer?.name || 'Coach'} size="sm" imageUrl={trainer?.avatar_url} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>+{unreadCount}</Text>
            </View>
          )}
        </View>

        {/* Custom Segmented Control */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Today' && styles.tabBtnActive]}
            onPress={() => setActiveTab('Today')}
          >
            <Text style={[styles.tabText, activeTab === 'Today' && styles.tabTextActive]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Past' && styles.tabBtnActive]}
            onPress={() => setActiveTab('Past')}
          >
            <Text style={[styles.tabText, activeTab === 'Past' && styles.tabTextActive]}>Past</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{activeTab === 'Today' ? 'Earlier Today' : 'Past Notifications'} <Text style={styles.sectionCount}>({activeData.length})</Text></Text>
          <TouchableOpacity>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {activeData.length > 0 ? activeData.map(renderNotification) : (
             <View style={styles.emptyState}>
               <Text style={styles.emptyText}>No {activeTab.toLowerCase()} notifications.</Text>
             </View>
          )}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  
  // Header
  headerContainer: {
    backgroundColor: colors.headerBg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: colors.headerSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  headerTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: colors.white, letterSpacing: -0.5 },
  headerBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  headerBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: colors.white },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.headerSurface,
    borderRadius: 20,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 16 },
  tabBtnActive: { backgroundColor: colors.headerSurfaceActive },
  tabText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.headerTextMuted },
  tabTextActive: { color: colors.white },

  // Content
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  sectionCount: { color: colors.textTertiary },

  listContainer: { gap: Spacing.md },
  
  card: {
    backgroundColor: colors.cardListBg,
    borderRadius: 24,
    padding: Spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  
  iconWrap: {
    width: 60, height: 60, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: colors.yellow,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.cardListBg,
  },
  iconBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.white },

  textContent: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textPrimary, marginBottom: 2 },
  cardDesc: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: colors.textTertiary, lineHeight: 18 },

  // Right Side Elements
  scorePill: {
    backgroundColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full,
  },
  scorePillText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textPrimary },
  
  checkIconWrap: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: colors.textPrimary,
    alignItems: 'center', justifyContent: 'center',
  },

  circularProgressWrap: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  circularProgressOuter: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 4, borderTopColor: colors.border, borderRightColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  circularProgressText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.textPrimary },

  // Layouts for specific types
  waterContainer: { marginTop: 4, gap: 6 },
  progressBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, width: '100%', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 3 },

  fileContainer: { marginTop: Spacing.sm, paddingLeft: 60 + Spacing.md }, // align with text content
  fileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  fileBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: colors.textPrimary },

  emptyState: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  emptyText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textTertiary },
});
