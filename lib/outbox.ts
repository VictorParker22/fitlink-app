/**
 * Chat outbox — messages that failed to send because the device was offline.
 *
 * When a send fails on connectivity, the chat screens queue the message here
 * and render it with an honest "Waiting to send" state (never a fake sent
 * tick). When NetInfo reports reconnect, the screens call flushOutbox which
 * replays the queue in order, deduped by tempId, removing each entry only
 * after the server accepts it.
 *
 * Storage is per-user (auth user id in the key) so tenants never bleed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const VERSION = 'v1';
const outboxKey = (userId: string) => `fitlink.outbox.${VERSION}.${userId}`;

export interface OutboxMessage {
  tempId: string;
  conversationId: string;
  senderType: 'trainer' | 'client';
  content: string;
  createdAt: string; // ISO — when the user hit send, not when it flushes
}

export interface FlushedMessage {
  tempId: string;
  /** The real row the server returned for this queued message. */
  row: any;
}

/**
 * Heuristic for "this failed because of connectivity, not because the server
 * rejected it". Only connectivity failures belong in the outbox — a real
 * rejection (RLS, validation) must surface to the user instead of silently
 * retrying forever.
 */
export function isNetworkError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /network|failed to fetch|fetch failed|timeout|timed out|connection|socket|offline|abort/i.test(msg);
}

export function makeTempId(): string {
  return `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadOutbox(userId: string | null | undefined): Promise<OutboxMessage[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOutbox(userId: string, queue: OutboxMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(queue));
  } catch {
    // Best-effort — worst case the bubble stays pending until next app open.
  }
}

/** Append a message to the queue (no-op if the tempId is already queued). */
export async function enqueueMessage(userId: string | null | undefined, message: OutboxMessage): Promise<void> {
  if (!userId) return;
  try {
    const queue = await loadOutbox(userId);
    if (queue.some((m) => m.tempId === message.tempId)) return;
    queue.push(message);
    await writeOutbox(userId, queue);
  } catch {
    // Best-effort.
  }
}

export async function removeFromOutbox(userId: string | null | undefined, tempId: string): Promise<void> {
  if (!userId) return;
  try {
    const queue = await loadOutbox(userId);
    await writeOutbox(userId, queue.filter((m) => m.tempId !== tempId));
  } catch {
    // Best-effort.
  }
}

// One flush at a time per user — reconnect events can fire in bursts and the
// queue must never be replayed twice.
const flushing = new Set<string>();

/**
 * Replay the queue in order. `send` must return the inserted server row on
 * success, or null on failure; the first failure stops the flush so ordering
 * is preserved for the next attempt. Entries are deduped by tempId.
 */
export async function flushOutbox(
  userId: string | null | undefined,
  send: (message: OutboxMessage) => Promise<any | null>
): Promise<FlushedMessage[]> {
  if (!userId || flushing.has(userId)) return [];
  flushing.add(userId);
  const flushed: FlushedMessage[] = [];
  try {
    const queue = await loadOutbox(userId);
    const seen = new Set<string>();
    for (const message of queue) {
      if (seen.has(message.tempId)) {
        // Duplicate tempId — drop the extra copy, keep only the first.
        await removeFromOutbox(userId, message.tempId);
        continue;
      }
      seen.add(message.tempId);
      let row: any | null = null;
      try {
        row = await send(message);
      } catch {
        row = null;
      }
      if (!row) break; // still offline or rejected — retry later, in order
      await removeFromOutbox(userId, message.tempId);
      flushed.push({ tempId: message.tempId, row });
    }
  } catch {
    // Best-effort.
  } finally {
    flushing.delete(userId);
  }
  return flushed;
}
