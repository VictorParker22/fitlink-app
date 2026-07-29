import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useClient } from '../context/ClientContext';
import { calculateLevel } from '../utils/xp';

export interface CelebrationData {
  id: string;
  type: 'first_workout' | 'streak_milestone' | 'level_up' | 'weight_goal' | 'custom';
  title: string;
  subtitle: string;
  icon: string;
  badgeText?: string;
}

const CELEBRATIONS_STORE_KEY = 'fitlink_celebrations_shown';

export function useCelebrations() {
  const { clientData } = useClient();
  const [activeCelebration, setActiveCelebration] = useState<CelebrationData | null>(null);

  const triggerCelebration = useCallback((data: CelebrationData) => {
    setActiveCelebration(data);
  }, []);

  const checkMilestones = useCallback(async () => {
    if (!clientData) return;

    try {
      const storedStr = await SecureStore.getItemAsync(CELEBRATIONS_STORE_KEY);
      const shownIds: string[] = storedStr ? JSON.parse(storedStr) : [];

      const completedCount = clientData.completed_workouts || 0;
      const streak = clientData.progress?.streak || 0;
      const xp = clientData.xp || 0;
      const levelNum = calculateLevel(xp);

      // Check 1: First workout
      if (completedCount >= 1 && !shownIds.includes('first_workout')) {
        triggerCelebration({
          id: 'first_workout',
          type: 'first_workout',
          title: 'First Workout Crushed!',
          subtitle: "You've officially taken the first big step on your fitness journey.",
          icon: 'trophy',
          badgeText: '+100 XP',
        });
        return;
      }

      // Check 2: 7-day streak
      if (streak >= 7 && !shownIds.includes(`streak_${streak}`)) {
        triggerCelebration({
          id: `streak_${streak}`,
          type: 'streak_milestone',
          title: `${streak}-Day Streak! 🔥`,
          subtitle: 'Unstoppable consistency. Your coach is going to be proud.',
          icon: 'flame',
          badgeText: 'STREAK MASTER',
        });
        return;
      }

      // Check 3: Level Up (Level 2+)
      if (levelNum > 1 && !shownIds.includes(`level_${levelNum}`)) {
        triggerCelebration({
          id: `level_${levelNum}`,
          type: 'level_up',
          title: `Level ${levelNum} Unlocked! ⚡`,
          subtitle: `You reached Level ${levelNum}. Keep grinding to unlock higher tiers!`,
          icon: 'flash',
          badgeText: `LEVEL ${levelNum}`,
        });
        return;
      }
    } catch (err) {
      console.warn('Failed checking celebration milestones:', err);
    }
  }, [clientData, triggerCelebration]);

  const dismissCelebration = useCallback(async () => {
    if (!activeCelebration) return;
    try {
      const storedStr = await SecureStore.getItemAsync(CELEBRATIONS_STORE_KEY);
      const shownIds: string[] = storedStr ? JSON.parse(storedStr) : [];
      if (!shownIds.includes(activeCelebration.id)) {
        shownIds.push(activeCelebration.id);
        await SecureStore.setItemAsync(CELEBRATIONS_STORE_KEY, JSON.stringify(shownIds));
      }
    } catch (e) {
      // ignore
    }
    setActiveCelebration(null);
  }, [activeCelebration]);

  useEffect(() => {
    checkMilestones();
  }, [checkMilestones]);

  return {
    activeCelebration,
    triggerCelebration,
    dismissCelebration,
  };
}
