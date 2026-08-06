// hooks/useDismissedActions.ts
// Persists dismissed Copilot action IDs in AsyncStorage.
// Auto-expires dismissals after 24h so a still-at-risk client resurfaces.

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_KEY = 'copilot_dismissed_v1';
const EXPIRY_MS     = 24 * 60 * 60 * 1000; // 24 hours

type DismissedMap = Record<string, string>; // actionId → ISO timestamp

export const useDismissedActions = () => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // ── Load on mount and prune expired entries ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DISMISSED_KEY);
        if (!raw) return;

        const map: DismissedMap = JSON.parse(raw);
        const now  = Date.now();
        const valid: DismissedMap = {};
        const validIds  = new Set<string>();

        for (const [id, ts] of Object.entries(map)) {
          if (now - new Date(ts).getTime() < EXPIRY_MS) {
            valid[id]  = ts;
            validIds.add(id);
          }
        }

        // Persist pruned map back to storage
        await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(valid));
        setDismissedIds(validIds);
      } catch {
        // Non-critical — just show all actions if storage fails
      }
    })();
  }, []);

  // ── Dismiss an action ─────────────────────────────────────────────────────
  const dismissAction = useCallback(async (actionId: string) => {
    setDismissedIds(prev => new Set([...prev, actionId]));

    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      const map: DismissedMap = raw ? JSON.parse(raw) : {};
      map[actionId] = new Date().toISOString();
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
    } catch {
      // Silent — UI already dismissed optimistically
    }
  }, []);

  return { dismissedIds, dismissAction };
};
