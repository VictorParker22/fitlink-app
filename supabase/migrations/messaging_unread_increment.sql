-- Migration: Atomic unread counter increment for conversations
-- Used by client-side my-messages.tsx when sending a message so the
-- coach's conversation list badge updates correctly without stale reads.

CREATE OR REPLACE FUNCTION increment_conversation_unread(
  conv_id UUID,
  new_last_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
  SET
    unread_count = unread_count + 1,
    last_message = new_last_message,
    last_message_at = NOW()
  WHERE id = conv_id;
END;
$$;

-- Grant execute to authenticated users (clients send messages, trainers don't call this)
GRANT EXECUTE ON FUNCTION increment_conversation_unread(UUID, TEXT) TO authenticated;
