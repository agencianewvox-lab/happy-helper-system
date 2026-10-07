-- Read-only source export. Return base64 only for audio messages. Never print the result.
-- Replace __CURSOR__ with an empty string or: AND id > '<validated UUID>'::uuid
WITH src AS MATERIALIZED (
 SELECT id, CASE WHEN jsonb_typeof(dados_extras->'data')='object' THEN dados_extras->'data' ELSE dados_extras END d, dados_extras r
 FROM public.whatsapp_conversas
 WHERE coalesce(recebido_em,created_at)>='2026-07-06T03:00:00Z'::timestamptz
 AND coalesce(recebido_em,created_at)<='2026-10-07T01:07:39Z'::timestamptz __CURSOR__
), audio AS MATERIALIZED (
 SELECT id, coalesce(nullif(d#>>'{message,base64}',''),nullif(d->>'base64',''),nullif(r->>'base64',''),nullif(d#>>'{message,audioMessage,base64}','')) audio_base64
 FROM src WHERE d->>'messageType'='audioMessage' OR d#>'{message,audioMessage}' IS NOT NULL
)
SELECT id::text source_id,audio_base64,
 encode(sha256(convert_to(audio_base64,'UTF8')),'hex') audio_base64_sha256
FROM audio WHERE audio_base64 IS NOT NULL ORDER BY id LIMIT 20;
