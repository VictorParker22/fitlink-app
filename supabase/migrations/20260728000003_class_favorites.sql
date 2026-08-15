-- ============================================================
-- On-Demand Classes — Client Favorites
-- ============================================================

CREATE TABLE IF NOT EXISTS class_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, class_id)
);

-- RLS
ALTER TABLE class_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage own favorites" ON class_favorites
  FOR ALL USING (auth.uid() = client_id);

CREATE INDEX idx_favorites_client ON class_favorites(client_id);
