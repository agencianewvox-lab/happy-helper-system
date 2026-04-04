
-- Table: nps_predictions
CREATE TABLE public.nps_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text UNIQUE NOT NULL,
  nps_score numeric NOT NULL DEFAULT 0,
  nps_categoria text NOT NULL DEFAULT 'neutro' CHECK (nps_categoria IN ('promotor', 'neutro', 'detrator')),
  confianca integer NOT NULL DEFAULT 0,
  fatores_positivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  fatores_negativos jsonb NOT NULL DEFAULT '[]'::jsonb,
  fator_principal text,
  recomendacao text,
  tendencia text CHECK (tendencia IN ('subindo', 'estavel', 'caindo')),
  score_anterior numeric,
  dimension_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nps_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read nps_predictions" ON public.nps_predictions FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated insert nps_predictions" ON public.nps_predictions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update nps_predictions" ON public.nps_predictions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access nps_predictions" ON public.nps_predictions FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: nps_prediction_history
CREATE TABLE public.nps_prediction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  nps_score numeric NOT NULL,
  nps_categoria text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nps_prediction_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read nps_prediction_history" ON public.nps_prediction_history FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated insert nps_prediction_history" ON public.nps_prediction_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role full access nps_prediction_history" ON public.nps_prediction_history FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX idx_nps_history_group_recorded ON public.nps_prediction_history (group_id, recorded_at DESC);

-- Enable realtime for nps_predictions
ALTER PUBLICATION supabase_realtime ADD TABLE public.nps_predictions;
