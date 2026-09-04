import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppClients, useAppMeta } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import CelebrationOverlay from '../../CelebrationOverlay';
import { useIsDayOne } from './HomeModeGate';

const FIRST_CLIENT_CELEBRATED_KEY = 'coach_first_client_celebrated';

/**
 * Golden path: one-time celebration when the roster goes 0 → 1. Only tracked
 * after the initial fetch settles (`loading` false), so the empty-array-then-
 * populated hydration of an existing roster never fires it.
 *
 * Mounted in both home modes so the 0 → 1 transition is observed while the
 * day-one checklist is up; the overlay itself only shows over the populated
 * dashboard, exactly as before the split. Reads clients + meta for the
 * tracking, and the day-one gate (clients, sessions, business) to hold the
 * overlay back — it renders null almost always, so that breadth is cheap.
 */
const FirstClientCelebration = React.memo(function FirstClientCelebration() {
  useRenderCount('FirstClientCelebration');
  const { clients } = useAppClients();
  const { loading } = useAppMeta();
  const isDayOne = useIsDayOne();

  const [celebratedName, setCelebratedName] = useState<string | null>(null);
  const prevClientCount = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    const count = clients.length;
    const prev = prevClientCount.current;
    prevClientCount.current = count;
    if (prev === 0 && count === 1) {
      const name = clients[0]?.name || 'Your first athlete';
      AsyncStorage.getItem(FIRST_CLIENT_CELEBRATED_KEY)
        .then(v => {
          if (v) return;
          AsyncStorage.setItem(FIRST_CLIENT_CELEBRATED_KEY, '1').catch(() => {});
          setCelebratedName(name);
        })
        .catch(() => {});
    }
  }, [loading, clients.length]);

  const dismiss = useCallback(() => setCelebratedName(null), []);

  if (isDayOne || celebratedName === null) return null;

  // One-time first-client celebration (flag set before this renders).
  return (
    <CelebrationOverlay
      visible={celebratedName !== null}
      kind="first-client"
      title={celebratedName}
      subtitle="Your roster is live. Their sessions, check-ins and progress start landing on your dashboard from here."
      primary={{ label: "Let's go", onPress: dismiss }}
      onDismiss={dismiss}
    />
  );
});

export default FirstClientCelebration;
