-- Allow clients to update their own row (needed for assessment data and plan upgrades)
CREATE POLICY "Clients can update own row"
  ON clients FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
