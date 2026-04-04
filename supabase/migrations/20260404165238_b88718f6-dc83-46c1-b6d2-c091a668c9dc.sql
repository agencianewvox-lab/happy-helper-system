
-- Calendar events table for internal agenda
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'reuniao',
  created_by TEXT NOT NULL,
  participants TEXT[] DEFAULT '{}',
  group_id TEXT,
  location TEXT,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read all events
CREATE POLICY "Authenticated read calendar_events"
  ON public.calendar_events FOR SELECT
  TO authenticated
  USING (true);

-- Everyone authenticated can insert events
CREATE POLICY "Authenticated insert calendar_events"
  ON public.calendar_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Everyone authenticated can update events
CREATE POLICY "Authenticated update calendar_events"
  ON public.calendar_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Everyone authenticated can delete events
CREATE POLICY "Authenticated delete calendar_events"
  ON public.calendar_events FOR DELETE
  TO authenticated
  USING (true);
