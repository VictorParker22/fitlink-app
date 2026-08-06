import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActionCategory } from '../lib/copilot/types';

const ANALYTICS_KEY = 'copilot_analytics_v1';

export interface CopilotAnalyticsData {
  taps: number;
  dismisses: number;
  tapsByCategory: Partial<Record<ActionCategory, number>>;
  dismissesByCategory: Partial<Record<ActionCategory, number>>;
}

const defaultData: CopilotAnalyticsData = {
  taps: 0,
  dismisses: 0,
  tapsByCategory: {},
  dismissesByCategory: {},
};

export const useCopilotAnalytics = () => {
  const [analytics, setAnalytics] = useState<CopilotAnalyticsData>(defaultData);

  useEffect(() => {
    AsyncStorage.getItem(ANALYTICS_KEY).then(raw => {
      if (raw) {
        setAnalytics(JSON.parse(raw));
      }
    });
  }, []);

  const trackEvent = useCallback(async (outcome: 'tapped' | 'dismissed', category: ActionCategory) => {
    setAnalytics(prev => {
      const next = { ...prev };
      if (outcome === 'tapped') {
        next.taps += 1;
        next.tapsByCategory[category] = (next.tapsByCategory[category] || 0) + 1;
      } else {
        next.dismisses += 1;
        next.dismissesByCategory[category] = (next.dismissesByCategory[category] || 0) + 1;
      }
      
      // Fire and forget storage update
      AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(next)).catch(() => {});
      
      return next;
    });
  }, []);

  return { analytics, trackEvent };
};
