import React from 'react';
import { useAppBusiness, useAppClients, useAppSessions } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import { activeOf } from './homeSignals';

/**
 * Day-one empty state: no athletes, no sessions, no notifications yet —
 * nothing to build a real dashboard from. Reads three slices, but only to
 * produce one boolean, so the gate itself is the only thing that re-renders.
 */
export function useIsDayOne(): boolean {
  const { clients } = useAppClients();
  const { sessions } = useAppSessions();
  const { notifications } = useAppBusiness();
  return activeOf(clients).length === 0 && sessions.length === 0 && notifications.length === 0;
}

interface HomeModeGateProps {
  dayOne: React.ReactNode;
  populated: React.ReactNode;
}

/**
 * Picks the day-one checklist or the populated dashboard. The two trees are
 * built once by the shell and passed in as elements, so a slice change here
 * re-renders the gate and React bails out of the unchanged subtree.
 */
const HomeModeGate = React.memo(function HomeModeGate({ dayOne, populated }: HomeModeGateProps) {
  useRenderCount('HomeModeGate');
  const isDayOne = useIsDayOne();
  return <>{isDayOne ? dayOne : populated}</>;
});

export default HomeModeGate;
