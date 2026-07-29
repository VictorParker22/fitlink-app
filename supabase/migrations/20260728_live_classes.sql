-- Create live_classes table
CREATE TABLE live_classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  mux_stream_id TEXT,
  mux_stream_key TEXT,
  mux_playback_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE live_classes ENABLE ROW LEVEL SECURITY;

-- Trainers can manage their own live classes
CREATE POLICY "Trainers can manage own live classes" 
  ON live_classes FOR ALL 
  USING (trainer_id = auth.uid());

-- Clients can view scheduled and live classes
CREATE POLICY "Anyone can view live classes"
  ON live_classes FOR SELECT
  USING (status IN ('scheduled', 'live', 'ended'));

-- Create function to update updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update_at on live_classes
CREATE TRIGGER update_live_classes_updated_at
BEFORE UPDATE ON live_classes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE live_classes;
