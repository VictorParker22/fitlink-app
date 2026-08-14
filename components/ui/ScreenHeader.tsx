import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

interface ScreenHeaderProps {
  /** Title shown in the center of the header */
  title?: string;
  /** Called when back button is pressed */
  onBack: () => void;
  /** Show a share button on the right */
  showShare?: boolean;
  /** Called when share button is pressed */
  onShare?: () => void;
  /** Show a favorite (star) toggle on the right */
  showFavorite?: boolean;
  /** Whether the item is currently favorited */
  isFavorite?: boolean;
  /** Called when favorite button is toggled */
  onFavoriteToggle?: () => void;
  /** Additional right-side elements */
  rightElement?: React.ReactNode;
}

/**
 * Reusable screen header with back button, optional title, and right actions.
 * Used across 8+ screens. Fixed-dark to match the FitLink design system.
 */
export default function ScreenHeader({
  title,
  onBack,
  showShare,
  onShare,
  showFavorite,
  isFavorite = false,
  onFavoriteToggle,
  rightElement,
}: ScreenHeaderProps) {
  return (
    <View style={s.container}>
      <TouchableOpacity
        style={s.btn}
        activeOpacity={0.6}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
      </TouchableOpacity>

      {title ? <Text style={s.title} numberOfLines={1}>{title}</Text> : <View style={s.spacer} />}

      <View style={s.right}>
        {showFavorite && (
          <TouchableOpacity
            style={s.btn}
            activeOpacity={0.6}
            onPress={() => {
              onFavoriteToggle?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={22}
              color={isFavorite ? CoachColors.accent : CoachColors.textPrimary}
            />
          </TouchableOpacity>
        )}
        {showShare && (
          <TouchableOpacity
            style={s.btn}
            activeOpacity={0.6}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share"
          >
            <Ionicons name="share-outline" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        )}
        {rightElement}
        {/* Keep right side from collapsing so title stays centered */}
        {!showFavorite && !showShare && !rightElement && <View style={s.btn} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    height: 52,
  },
  btn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    marginHorizontal: 4,
  },
  spacer: { flex: 1 },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
