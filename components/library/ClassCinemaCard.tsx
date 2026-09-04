/**
 * ClassCinemaCard — 190pt cinema card for an on-demand class.
 *
 * CardImage (thumbnail_url, session-bg fallback) with the sanctioned scrim;
 * status + duration pills up top, title + real engagement stats and a 44pt
 * play circle at the bottom. Stats render only when they are > 0.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import CardImage from '../ui/CardImage';
import type { ClassItem } from '../../context/AppContext';

// CoachColors.bg with alpha — the sanctioned pill wash (DESIGN.md § Imagery).
const PILL_WASH = 'rgba(16,18,16,0.55)';

interface ClassCinemaCardProps {
  item: ClassItem;
  onPress: () => void;
  onDelete: () => void;
}

export default function ClassCinemaCard({ item, onPress, onDelete }: ClassCinemaCardProps) {
  const published = item.status === 'published';
  const archived = item.status === 'archived';
  const statusLabel = published ? 'PUBLISHED' : archived ? 'ARCHIVED' : 'DRAFT';
  const statusColor = published ? CoachColors.accent : archived ? CoachColors.warning : CoachColors.textMuted;

  const takes = item.take_count || 0;
  const rating = item.avg_rating || 0;
  const watchMin = item.total_watch_minutes || 0;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${statusLabel.toLowerCase()}. Long press to delete.`}
    >
      <CardImage
        source={item.thumbnail_url ? { uri: item.thumbnail_url } : require('../../assets/images/session-bg.jpg')}
        scrim="gradient"
        recyclingKey={item.id}
      />

      {/* Top row: status + duration */}
      <View style={s.topRow}>
        <View style={s.pill}>
          {published && <View style={s.liveDot} />}
          <Text style={[s.pillText, { color: statusColor }]} maxFontSizeMultiplier={1.2}>{statusLabel}</Text>
        </View>
        {(item.duration_minutes || 0) > 0 && (
          <View style={s.pill}>
            <Text style={[s.pillText, s.monoPillText]} maxFontSizeMultiplier={1.2}>{item.duration_minutes} min</Text>
          </View>
        )}
      </View>

      {/* Bottom: title + stats + play circle */}
      <View style={s.bottomRow}>
        <View style={s.bottomText}>
          <Text style={s.title} numberOfLines={2} maxFontSizeMultiplier={1.4}>{item.title}</Text>
          {(takes > 0 || rating > 0 || watchMin > 0) && (
            <View style={s.statRow}>
              {takes > 0 && (
                <View style={s.stat}>
                  <Ionicons name="play-outline" size={12} color={CoachColors.textSecondary} />
                  <Text style={s.statText} maxFontSizeMultiplier={1.2}>{takes}</Text>
                </View>
              )}
              {rating > 0 && (
                <View style={s.stat}>
                  <Ionicons name="star" size={12} color={CoachColors.textSecondary} />
                  <Text style={s.statText} maxFontSizeMultiplier={1.2}>{rating.toFixed(1)}</Text>
                </View>
              )}
              {watchMin > 0 && (
                <View style={s.stat}>
                  <Ionicons name="time-outline" size={12} color={CoachColors.textSecondary} />
                  <Text style={s.statText} maxFontSizeMultiplier={1.2}>{watchMin} min</Text>
                </View>
              )}
            </View>
          )}
        </View>
        <View style={[s.playCircle, published ? s.playCirclePublished : s.playCircleDraft]}>
          <Ionicons
            name="play"
            size={19}
            color={published ? CoachColors.onAccent : CoachColors.textPrimary}
            style={{ marginLeft: 2 }}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    height: 190,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: CoachColors.surface,
    padding: 14,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PILL_WASH,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: CoachColors.accent,
  },
  pillText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10.5,
    letterSpacing: 0.7,
  },
  monoPillText: {
    fontFamily: CoachFonts.mono,
    color: CoachColors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  bottomText: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
    lineHeight: 24,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    color: CoachColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCirclePublished: {
    backgroundColor: CoachColors.accent,
  },
  playCircleDraft: {
    borderWidth: 1.5,
    borderColor: CoachColors.textPrimary,
    backgroundColor: PILL_WASH,
  },
});
