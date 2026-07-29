import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

export function useRestChime() {
  const triggerCountdownTick = useCallback(async (sec: number) => {
    if (sec <= 3 && sec > 0) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Speech.speak(String(sec), { language: 'en-US', rate: 1.2, pitch: 1.1 });
      } catch (e) {
        console.log('[useRestChime] Countdown tick error:', e);
      }
    }
  }, []);

  const triggerRestCue = useCallback(async () => {
    // 1. Triple Haptic Burst
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 150);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
    } catch (e) {
      console.log('[useRestChime] Haptic error:', e);
    }

    // 2. Audio Voice Cue
    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        await Speech.stop();
      }
      Speech.speak('Rest complete. Next set!', {
        language: 'en-US',
        pitch: 1.0,
        rate: 1.1,
      });
    } catch (e) {
      console.log('[useRestChime] Speech error:', e);
    }
  }, []);

  return { triggerRestCue, triggerCountdownTick };
}
