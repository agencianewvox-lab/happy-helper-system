
CREATE TABLE public.office_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  x INTEGER NOT NULL DEFAULT 5,
  y INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'online',
  avatar_color TEXT NOT NULL DEFAULT '#3b82f6',
  current_room TEXT,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.office_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view presence"
ON public.office_presence FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert own presence"
ON public.office_presence FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
ON public.office_presence FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presence"
ON public.office_presence FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.office_presence;
