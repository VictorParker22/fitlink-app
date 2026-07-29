import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWorkout, RUN_PHASES, TOTAL_RUN_DURATION } from '../context/WorkoutContext';
import { FontFamily } from '../constants/theme';

function WorkoutMiniPlayer() {
  const router = useRouter();
  const { activeSession, isPlaying, totalElapsedSec, togglePlayPause, confirmStopWorkout } = useWorkout();

  if (!activeSession?.isActive || !activeSession.setupComplete) return null;

  const isRunning = activeSession.classInfo.category === 'Running';

  // Progress calculation
  const durationSec = isRunning
    ? TOTAL_RUN_DURATION
    : (parseInt(activeSession.classInfo.durationMin) || 30) * 60;
  const progress = Math.min(totalElapsedSec / durationSec, 1);

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(client-tabs)/class-player' as any);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    confirmStopWorkout();
  };

  const handlePlayPause = () => {
    togglePlayPause();
    Haptics.selectionAsync();
  };

  return (
    <TouchableOpacity style={s.container} activeOpacity={0.95} onPress={handleTap}>
      {/* Play/Pause button */}
      <TouchableOpacity
        style={s.playBtn}
        onPress={(e) => { e.stopPropagation(); handlePlayPause(); }}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#000" />
      </TouchableOpacity>

      {/* Title */}
      <Text style={s.title} numberOfLines={1}>{activeSession.classInfo.title}</Text>

      {/* Close button */}
      <TouchableOpacity
        style={s.closeBtn}
        onPress={(e) => { e.stopPropagation(); handleClose(); }}
        activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color="rgba(255,255,255,0.45)" />
      </TouchableOpacity>

      {/* Progress bar at bottom */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

export default memo(WorkoutMiniPlayer);

const s = StyleSheet.create({
  container: {
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginLeft: 14,
    marginRight: 14,
  },
  closeBtn: {
    padding: 4,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#5B7FFF',
  },
});
