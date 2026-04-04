
ALTER TABLE public.nps_surveys
  ADD COLUMN survey_type text NOT NULL DEFAULT 'operacao',
  ADD COLUMN quality_rating text,
  ADD COLUMN communication_rating text,
  ADD COLUMN results_rating text,
  ADD COLUMN manager_rating text,
  ADD COLUMN improvement_comment text,
  ADD COLUMN referral_1_name text,
  ADD COLUMN referral_1_company text,
  ADD COLUMN referral_1_contact text,
  ADD COLUMN referral_2_name text,
  ADD COLUMN referral_2_company text,
  ADD COLUMN referral_2_contact text,
  ADD COLUMN referral_3_name text,
  ADD COLUMN referral_3_company text,
  ADD COLUMN referral_3_contact text;
