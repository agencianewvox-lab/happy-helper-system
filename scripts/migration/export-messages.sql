-- Read-only source export. Replace __CURSOR__ with an empty string or a validated UUID keyset predicate.
-- Fixed snapshot: Jul 6 00:00 BRT through Oct 6 22:07:39 BRT. Never print returned message rows.
with chosen as materialized (
 select id,created_at,recebido_em,direcao,group_id,mensagem,nome_contato,status,telefone,dados_extras as root
 from public.whatsapp_conversas
 where coalesce(recebido_em,created_at)>='2026-07-06T03:00:00Z'::timestamptz and coalesce(recebido_em,created_at)<='2026-10-07T01:07:39Z'::timestamptz __CURSOR__
 order by id limit 1000
), objects as materialized (
 select *, case when jsonb_typeof(root->'data')='object' then root->'data' else root end as data from chosen
), classified as materialized (
 select *, coalesce(data->>'messageType','unknown') as kind, coalesce(data#>'{message,audioMessage}','{}'::jsonb) as audio from objects
), safe as materialized (
 select id,jsonb_build_object('id',id,'created_at',created_at,'recebido_em',recebido_em,'direcao',direcao,'group_id',group_id,'nome_contato',nome_contato,'status',status,'telefone',telefone,
 'mensagem',case when kind='imageMessage' or mensagem ~* '^\[Imagem\](\s|$)' then '[Imagem]' when kind='videoMessage' or mensagem ~* '^\[Vídeo\](\s|$)' then '[Vídeo]' else mensagem end,
 'dados_extras',jsonb_strip_nulls(jsonb_build_object('event',root->'event','instance',root->'instance','sender',root->'sender','date_time',root->'date_time',
 'data',jsonb_strip_nulls(jsonb_build_object('key',data->'key','messageTimestamp',data->'messageTimestamp','messageType',data->'messageType','pushName',data->'pushName','source',data->'source','status',data->'status','instanceId',data->'instanceId',
 'message',case when kind='audioMessage' or audio<>'{}'::jsonb then jsonb_build_object('audioMessage',jsonb_strip_nulls(jsonb_build_object('mimetype',audio->'mimetype','seconds',audio->'seconds','ptt',audio->'ptt','fileLength',audio->'fileLength','url',audio->'url','directPath',audio->'directPath','fileSha256',audio->'fileSha256','fileEncSha256',audio->'fileEncSha256','mediaKey',audio->'mediaKey','mediaKeyTimestamp',audio->'mediaKeyTimestamp'))) else null end)),
 '_retention',jsonb_build_object('policy','audio_text_metadata_v2','non_audio_media_stored',false,'audio_copy_pending',kind='audioMessage' or audio<>'{}'::jsonb)
 ))) as row_data from classified
)
select 'whatsapp_conversas' as source_table,id::text as source_id,row_data::text as row_json,encode(sha256(convert_to(row_data::text,'UTF8')),'hex') as row_hash from safe order by id;
