-- Private bucket for spoken corner lines. Only the service role writes and
-- reads it (the text-to-speech function returns short-lived signed URLs),
-- so no storage policies are granted to authenticated.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('solo-audio', 'solo-audio', false, 5242880, ARRAY['audio/mpeg'])
ON CONFLICT (id) DO NOTHING;

-- solo_messages: make the write check explicit (audit item 7).
DROP POLICY IF EXISTS "Athletes manage own solo messages" ON public.solo_messages;
CREATE POLICY "Athletes manage own solo messages" ON public.solo_messages
  FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid()));
