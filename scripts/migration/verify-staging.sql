-- Target only: gorqyovidpdvuockzndm. Read-only, no message contents returned.
SELECT source_table,count(*) copied,
 count(*) FILTER(WHERE row_hash<>encode(sha256(convert_to(row_data::text,'UTF8')),'hex')) invalid_hashes,
 max(source_id) resume_after_id
FROM migration_stage.records WHERE source_project='fmipenijdipscnqhtwvy'
GROUP BY source_table ORDER BY source_table;
