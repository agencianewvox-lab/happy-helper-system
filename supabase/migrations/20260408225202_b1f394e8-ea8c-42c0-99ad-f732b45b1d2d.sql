
-- 1. Create office_rooms table
CREATE TABLE public.office_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  descricao text,
  icone text DEFAULT '🏢',
  cor text DEFAULT 'blue',
  capacidade_max integer DEFAULT 10,
  voz_ativa_padrao boolean DEFAULT false,
  ordem integer DEFAULT 0,
  ativo boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.office_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view rooms" ON public.office_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Masters can insert rooms" ON public.office_rooms FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));
CREATE POLICY "Masters can update rooms" ON public.office_rooms FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));
CREATE POLICY "Masters can delete rooms" ON public.office_rooms FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- Populate default rooms
INSERT INTO public.office_rooms (nome, descricao, icone, cor, capacidade_max, voz_ativa_padrao, ordem) VALUES
  ('Recepção', 'Sala inicial — bate-papo casual e boas-vindas', '🏠', 'blue', 10, false, 0),
  ('Sala de Reunião', 'Espaço para reuniões com voz ativa por padrão', '🎯', 'purple', 10, true, 1),
  ('Sala de Foco', 'Modo concentração — microfone desligado por padrão', '🧠', 'emerald', 10, false, 2),
  ('Sala de Criação', 'Social media e criativos — posts, campanhas', '🎨', 'pink', 10, false, 3),
  ('Sala de Tráfego', 'Gestores de tráfego — campanhas e métricas', '📊', 'amber', 10, false, 4),
  ('Copa', 'Hora do café, almoço, bate-papo off-topic', '☕', 'red', 10, false, 5);

-- 2. Modify office_presence to add room support
ALTER TABLE public.office_presence
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.office_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_avatar_color text DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS status_message text,
  ADD COLUMN IF NOT EXISTS mic_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS joined_room_at timestamptz;

-- 3. Create office_messages table
CREATE TABLE public.office_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.office_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  user_avatar_color text DEFAULT '#3b82f6',
  content text NOT NULL,
  tipo text NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'system', 'emoji_reaction')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_office_messages_room_created ON public.office_messages (room_id, created_at DESC);

ALTER TABLE public.office_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view messages" ON public.office_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can send messages" ON public.office_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Create office_direct_messages table
CREATE TABLE public.office_direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  from_user_name text NOT NULL,
  content text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_office_dm_users ON public.office_direct_messages (from_user_id, to_user_id, created_at DESC);

ALTER TABLE public.office_direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own DMs" ON public.office_direct_messages FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users can send DMs" ON public.office_direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Users can mark DMs as read" ON public.office_direct_messages FOR UPDATE TO authenticated
  USING (auth.uid() = to_user_id);

-- 5. Create office_voice_sessions table
CREATE TABLE public.office_voice_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid REFERENCES public.office_rooms(id) ON DELETE SET NULL,
  participantes uuid[] DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.office_voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view voice sessions" ON public.office_voice_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create voice sessions" ON public.office_voice_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update voice sessions" ON public.office_voice_sessions FOR UPDATE TO authenticated USING (true);

-- 6. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.office_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.office_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.office_direct_messages;
