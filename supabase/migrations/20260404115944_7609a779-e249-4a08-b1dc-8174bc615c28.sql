
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT NOT NULL,
  group_id TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tasks" ON public.tasks FOR SELECT TO public USING (true);
CREATE POLICY "Public insert tasks" ON public.tasks FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update tasks" ON public.tasks FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tasks" ON public.tasks FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
