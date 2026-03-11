
CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ai chat messages"
ON public.ai_chat_messages
FOR SELECT
TO public
USING (true);

CREATE POLICY "Public insert ai chat messages"
ON public.ai_chat_messages
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Public delete ai chat messages"
ON public.ai_chat_messages
FOR DELETE
TO public
USING (true);
