import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useTypingIndicator — Supabase Broadcast-based typing indicator
 * 
 * Uses Supabase Realtime Broadcast (not Presence) for ephemeral,
 * low-latency typing events. No database writes needed.
 * 
 * @param conversationId - The conversation channel ID
 * @param senderType - 'trainer' or 'client' (who is typing)
 * @param enabled - Whether to activate (false when no conversation)
 * 
 * @returns { isTyping, startTyping }
 *   - isTyping: true when the OTHER person is typing
 *   - startTyping: call this on every keystroke (auto-throttled)
 */
export function useTypingIndicator(
  conversationId: string | undefined,
  senderType: 'trainer' | 'client',
  enabled: boolean = true,
) {
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleRef = useRef<number>(0);
  const channelRef = useRef<any>(null);

  // Subscribe to typing events from the OTHER party
  useEffect(() => {
    if (!conversationId || !enabled) return;

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        // Only show indicator if it's from the OTHER sender type
        if (payload.payload?.sender !== senderType) {
          setIsTyping(true);

          // Clear previous timeout
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

          // Auto-clear after 3 seconds of no typing events
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 3000);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, senderType, enabled]);

  // Throttled send function — at most once every 2 seconds
  const startTyping = useCallback(() => {
    if (!channelRef.current) return;

    const now = Date.now();
    if (now - throttleRef.current < 2000) return; // Throttle: 2s min between sends
    throttleRef.current = now;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender: senderType },
    });
  }, [senderType]);

  return { isTyping, startTyping };
}
