
CREATE TABLE public.client_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read client_notes" ON public.client_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert client_notes" ON public.client_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete client_notes" ON public.client_notes FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_client_notes_group_id ON public.client_notes (group_id);
