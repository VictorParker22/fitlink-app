import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import Avatar from '../components/Avatar';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');

type NotificationType = 'message' | 'score' | 'water' | 'workout' | 'nutrition' | 'file';

interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  description: React.ReactNode;
  iconBg: string;
  iconName: keyof typeof Ionicons.glyphMap;
  // Extra props for specific types
  messageCount?: number;
  scoreGained?: number;
  waterProgress?: number; // 0-1
  waterRemaining?: string;
  workoutName?: string;
  nutritionProgress?: number; // 0-100
  nutritionValue?: string;
  fileName?: string;
}

const MOCK_NOTIFICATIONS: NotificationData[] = [
  {
    id: '1',
    type: 'message',
    title: 'Unread AI Chatbot Messages',
    description: <Text><Text style={{fontFamily: FontFamily.bodySemiBold, color: Colors.textSecondary}}>8 new</Text> Messages from sandow.ai!</Text>,
    iconBg: '#6B7280', // Gray
    iconName: 'chatbox-ellipses',
    messageCount: 8,
  },
  {
    id: '2',
    type: 'score',
    title: 'Score Increased!',
    description: <Text>Sandow Score is now <Text style={{fontFamily: FontFamily.bodySemiBold, color: Colors.textSecondary}}>87</Text></Text>,
    iconBg: '#F97316', // Orange
    iconName: 'add',
    scoreGained: 8,
  },
  {
    id: '3',
    type: 'water',
    title: 'Drink More Water!',
    description: <Text>You need to drink <Text style={{fontFamily: FontFamily.bodySemiBold, color: Colors.textSecondary}}>1500ml</Text> left.</Text>,
    iconBg: '#3B82F6', // Blue
    iconName: 'water',
    waterProgress: 0.6,
  },
  {
    id: '4',
    type: 'workout',
    title: 'Workout Complete!',
    description: <Text><Text style={{fontFamily: FontFamily.bodySemiBold, color: Colors.textSecondary}}>Upper Body</Text> Set Completed.</Text>,
    iconBg: '#84CC16', // Green
    iconName: 'barbell',
  },
  {
    id: '5',
    type: 'nutrition',
    title: 'Nutrition Update',
    description: <Text>Take <Text style={{fontFamily: FontFamily.bodySemiBold, color: Colors.textSecondary}}>87g</Text> of protein!</Text>,
    iconBg: '#A855F7', // Purple
    iconName: 'nutrition',
    nutritionProgress: 30,
  },
  {
    id: '6',
    type: 'file',
    title: 'Fitness Data Ready!',
    description: <Text>Here's fitness data for <Text style={{fontFamily: FontFamily.bodySemiBold, color: Colors.textSecondary}}>November.</Text></Text>,
    iconBg: '#EF4444', // Red
    iconName: 'document-text',
    fileName: 'Fitness_data_Nov.rar',
  },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trainer } = useApp();
  const [activeTab, setActiveTab] = useState<'Today' | 'Past'>('Today');

  const renderNotification = (item: NotificationData) => {
    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          {/* Icon Wrap */}
          <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
            <Ionicons name={item.iconName} size={24} color={Colors.white} />
            {item.type === 'message' && item.messageCount && (
              <View style={styles.iconBadge}>
                <Text style={styles.iconBadgeText}>{item.messageCount}</Text>
              </View>
            )}
          </View>

          {/* Text Content */}
          <View style={styles.textContent}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.type !== 'water' && item.type !== 'file' && (
               <Text style={styles.cardDesc}>{item.description}</Text>
            )}
            
            {/* Water specific layout */}
            {item.type === 'water' && (
              <View style={styles.waterContainer}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${item.waterProgress! * 100}%` }]} />
                </View>
                <Text style={styles.cardDesc}>{item.description}</Text>
              </View>
            )}
          </View>

          {/* Right Side Accessories */}
          {item.type === 'score' && (
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>+{item.scoreGained}</Text>
            </View>
          )}
          {item.type === 'workout' && (
            <View style={styles.checkIconWrap}>
              <Ionicons name="checkmark" size={16} color={Colors.white} />
            </View>
          )}
          {item.type === 'nutrition' && (
            <View style={styles.circularProgressWrap}>
              <View style={[styles.circularProgressOuter, { borderColor: item.iconBg }]}>
                 <Text style={styles.circularProgressText}>{item.nutritionProgress}%</Text>
              </View>
            </View>
          )}
        </View>

        {/* File specific bottom area */}
        {item.type === 'file' && (
          <View style={styles.fileContainer}>
            <Text style={styles.cardDesc}>{item.description}</Text>
            <TouchableOpacity style={styles.fileBtn}>
              <Text style={styles.fileBtnText}>{item.fileName}</Text>
              <Ionicons name="download-outline" size={18} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header Section (Dark) */}
      <View style={[styles.headerContainer, { paddingTop: insets.top || Spacing.xl }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          <View style={{ flex: 1 }} />
          
          {trainer ? (
            <Image source={{ uri: trainer.avatar_url || 'https://i.pravatar.cc/150?u=' + trainer.id }} style={styles.avatar} />
          ) : (
            <Avatar name="Coach" size="sm" />
          )}
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>+12</Text>
          </View>
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Earlier Today <Text style={styles.sectionCount}>(8)</Text></Text>
          <TouchableOpacity>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {activeTab === 'Today' ? MOCK_NOTIFICATIONS.map(renderNotification) : (
             <View style={styles.emptyState}>
               <Text style={styles.emptyText}>No past notifications.</Text>
             </View>
          )}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  
  // Header
  headerContainer: {
    backgroundColor: '#1E1E24', // Dark header background
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  headerTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: Colors.white, letterSpacing: -0.5 },
  headerBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  headerBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: Colors.white },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 16 },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  tabText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)' },
  tabTextActive: { color: Colors.white },

  // Content
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  sectionCount: { color: Colors.textTertiary },

  listContainer: { gap: Spacing.md },
  
  card: {
    backgroundColor: '#F9FAFB', // Light gray background
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
    backgroundColor: '#F97316',
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F9FAFB',
  },
  iconBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.white },

  textContent: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: Colors.textPrimary, marginBottom: 2 },
  cardDesc: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: '#6B7280', lineHeight: 18 },

  // Right Side Elements
  scorePill: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full,
  },
  scorePillText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: Colors.textPrimary },
  
  checkIconWrap: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },

  circularProgressWrap: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  circularProgressOuter: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 4, borderTopColor: '#E5E7EB', borderRightColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  circularProgressText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.textPrimary },

  // Layouts for specific types
  waterContainer: { marginTop: 4, gap: 6 },
  progressBarBg: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, width: '100%', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 3 },

  fileContainer: { marginTop: Spacing.sm, paddingLeft: 60 + Spacing.md }, // align with text content
  fileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  fileBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.textPrimary },

  emptyState: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  emptyText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textTertiary },
});
