
ALTER TABLE public.office_presence
  ADD COLUMN IF NOT EXISTS cam_enabled boolean DEFAULT false;

ALTER TABLE public.office_rooms
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS locked_by_name text;
