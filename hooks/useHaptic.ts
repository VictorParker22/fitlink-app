/**
 * useHaptic — System-aware haptic hook
 *
 * Rules:
 * - Max 3 haptics per 10-second window (4th is silently dropped)
 * - Gated on AppState === 'active' (no background haptics)
 * - oncePerDay: single JSON blob key ('haptic_log') with {eventKey: dateString}
 *   avoids accumulating hundreds of stale AsyncStorage keys over time
 * - Direct Haptics calls (impact during manipulation) should bypass this hook
 * - Android: expo-haptics handles it; we accept OEM quirks
 */
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 3;

export function useHaptic() {
  const recentFires = useRef<number[]>([]);

  const trigger = useCallback(async (
    type: HapticType,
    options?: { oncePerDay?: string; delayMs?: number }
  ) => {
    // Gate: only fire when app is in foreground
    if (AppState.currentState !== 'active') return;

    // Dedup: oncePerDay — single JSON blob, not one key per day
    if (options?.oncePerDay) {
      const today = new Date().toISOString().split('T')[0];
      try {
        const raw = await AsyncStorage.getItem('haptic_log');
        const log: Record<string, string> = raw ? JSON.parse(raw) : {};
        if (log[options.oncePerDay] === today) return; // already fired today
        log[options.oncePerDay] = today;
        await AsyncStorage.setItem('haptic_log', JSON.stringify(log));
      } catch { /* storage failure — allow haptic to fire */ }
    }

    // Rate limit: max 3 per 10s window
    const now = Date.now();
    recentFires.current = recentFires.current.filter(t => now - t < WINDOW_MS);
    if (recentFires.current.length >= MAX_PER_WINDOW) return;
    recentFires.current.push(now);

    const fire = () => {
      switch (type) {
        case 'light':     return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        case 'medium':    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        case 'heavy':     return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        case 'success':   return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        case 'warning':   return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        case 'error':     return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        case 'selection': return Haptics.selectionAsync();
      }
    };

    if (options?.delayMs) {
      setTimeout(fire, options.delayMs);
    } else {
      fire();
    }
  }, []);

  return { trigger };
}
