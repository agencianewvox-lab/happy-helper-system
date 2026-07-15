
SELECT cron.unschedule('cs-coach-0830');
SELECT cron.unschedule('cs-coach-1030');
SELECT cron.unschedule('cs-coach-1230');
SELECT cron.unschedule('cs-coach-1430');
SELECT cron.unschedule('cs-coach-1630');
DELETE FROM public.ai_prompts_config WHERE prompt_category = 'CS Coach';
UPDATE public.coach_config SET ativo = false;
