import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppBusiness } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface HomeHeaderProps {
  paddingTop: number;
  onSearch: () => void;
  onAssistant: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}

/**
 * Big date typography plus the icon row. Business slice only: the coach's
 * initial and the unread-notification badge.
 */
const HomeHeader = React.memo(function HomeHeader({
  paddingTop, onSearch, onAssistant, onNotifications, onProfile,
}: HomeHeaderProps) {
  useRenderCount('HomeHeader');
  const { trainer, notifications } = useAppBusiness();
  const firstName = trainer?.name?.split(' ')[0] || 'Coach';
  const unreadNotifs = notifications.filter(n => !n.is_read).length;

  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  return (
    <View style={[styles.header, { paddingTop }]}>
      <View>
        {/* Dynamic Type: the date is a tight single line sharing the header
            row with the icon buttons — shrink to fit rather than wrap. */}
        <Text style={styles.weekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{weekday}</Text>
        <Text style={styles.monthDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{monthDay}</Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onSearch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Ionicons name="search-outline" size={21} color={CoachColors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onAssistant}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Coach assistant"
        >
          <Ionicons name="sparkles-outline" size={21} color={CoachColors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onNotifications}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}
        >
          <Ionicons name="notifications-outline" size={21} color={CoachColors.textSecondary} />
          {unreadNotifs > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.avatarCircle}
          onPress={onProfile}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <Text style={styles.avatarInitial}>{firstName[0]?.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default HomeHeader;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  weekday: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textPrimary,
    lineHeight: 38,
  },
  monthDay: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textFaint,
    lineHeight: 38,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3, right: -3,
    // minHeight, not height: the count inside scales with Dynamic Type and
    // would be clipped by a hard 16pt box at large text sizes.
    minWidth: 16, minHeight: 16, borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: CoachColors.bg,
  },
  badgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.onAccent,
  },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5,
    color: CoachColors.onAccent,
  },
});
