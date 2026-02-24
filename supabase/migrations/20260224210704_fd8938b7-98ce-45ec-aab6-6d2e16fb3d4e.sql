
-- Table to track resolved pending demands
CREATE TABLE public.pending_demand_resolutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT NOT NULL,
  term TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, term, requested_at)
);

ALTER TABLE public.pending_demand_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read resolutions"
  ON public.pending_demand_resolutions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert resolutions"
  ON public.pending_demand_resolutions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update resolutions"
  ON public.pending_demand_resolutions FOR UPDATE
  USING (auth.uid() IS NOT NULL);
