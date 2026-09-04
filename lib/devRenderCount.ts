import { useRef } from 'react';

/**
 * Dev-only render counter. Logs every 25th render of a labelled component:
 *   [renders] CoachHome 25
 * Watch it on a device while realtime rows land to confirm the AppContext
 * slices actually cut re-renders. Compiles to a no-op outside __DEV__.
 */
export function useRenderCount(label: string): void {
  const count = useRef(0);
  if (!__DEV__) return;
  count.current += 1;
  if (count.current % 25 === 0) {
    console.log('[renders]', label, count.current);
  }
}
