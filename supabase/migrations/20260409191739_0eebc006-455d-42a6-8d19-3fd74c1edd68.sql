
CREATE TABLE public.webrtc_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  signal_type text NOT NULL,
  signal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.webrtc_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert signals"
ON public.webrtc_signals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Authenticated can read own signals"
ON public.webrtc_signals FOR SELECT
TO authenticated
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Authenticated can delete own signals"
ON public.webrtc_signals FOR DELETE
TO authenticated
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_signals;

-- Index for fast lookups
CREATE INDEX idx_webrtc_signals_to_user ON public.webrtc_signals(to_user_id, room_id);
CREATE INDEX idx_webrtc_signals_room ON public.webrtc_signals(room_id);
