-- Target: private migration_stage only. Never print audio values or copy them into Git.
-- Replace __AUDIO_VALUES__ with SQL-quoted, validated (source_id, base64, sha256_of_base64) tuples.
-- Verify returned copied count equals input count. Run only after normalized metadata is present.
WITH incoming(id,bytes,sha) AS (VALUES __AUDIO_VALUES__), merged AS (
SELECT r.source_id,jsonb_set(jsonb_set(r.row_data,'{dados_extras,data,message}',coalesce(r.row_data#>'{dados_extras,data,message}','{}'::jsonb)||jsonb_build_object('base64',i.bytes),true),'{dados_extras,_retention}',coalesce(r.row_data#>'{dados_extras,_retention}','{}'::jsonb)||jsonb_build_object('audio_copy_pending',false,'binary_audio_present',true,'audio_base64_sha256',i.sha),true) new_data
FROM migration_stage.records r JOIN incoming i ON i.id=r.source_id
WHERE r.source_project='fmipenijdipscnqhtwvy' AND r.source_table='whatsapp_conversas'
AND (r.row_data#>>'{dados_extras,_retention,audio_copy_pending}'='true' OR r.row_data#>>'{dados_extras,_retention,binary_audio_present}'='true')
AND encode(sha256(convert_to(i.bytes,'UTF8')),'hex')=i.sha
), updated AS (UPDATE migration_stage.records r SET row_data=m.new_data,row_hash=encode(sha256(convert_to(m.new_data::text,'UTF8')),'hex'),copied_at=now() FROM merged m WHERE r.source_project='fmipenijdipscnqhtwvy' AND r.source_table='whatsapp_conversas' AND r.source_id=m.source_id RETURNING 1) SELECT count(*) copied FROM updated;
