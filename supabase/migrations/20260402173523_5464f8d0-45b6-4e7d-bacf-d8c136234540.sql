
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder text NOT NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ai conversations" ON public.ai_conversations FOR SELECT TO public USING (true);
CREATE POLICY "Public insert ai conversations" ON public.ai_conversations FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update ai conversations" ON public.ai_conversations FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete ai conversations" ON public.ai_conversations FOR DELETE TO public USING (true);

ALTER TABLE public.ai_chat_messages ADD COLUMN conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE;
