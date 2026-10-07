import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { incomingMessage, eventRowId } from "../_shared/incoming-message.ts";

// User approved preserving this connection and changing ONLY its Panel forwarding target.
const INSTANCE = "voxi_executivo_d13a86fd";
// Migration-only bridge: remove when the site's database cutover is validated.
// It keeps the currently deployed Panel working. Never sends directly to WhatsApp.
const LEGACY_RECEIVER = "https://fmipenijdipscnqhtwvy.supabase.co/functions/v1/whatsapp-webhook";
const reply = (value: unknown, status = 200) => Response.json(value, { status });
async function matchesSecret(supplied: unknown, expected: string) {
  if (typeof supplied !== "string" || !supplied || !expected) return false;
  const hash = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a,b] = await Promise.all([hash(supplied), hash(expected)]);
  return new Uint8Array(a).reduce((diff, value, i) => diff | (value ^ new Uint8Array(b)[i]), 0) === 0;
}
let credentialCache: { hash: string; until: number } | null = null;
async function verifiedProviderKey(body: any, db: any) {
  if (await matchesSecret(body?.apikey, Deno.env.get("EVOLUTION_API_KEY") || "")) return true;
  if (typeof body?.apikey !== "string" || !body.apikey || body.apikey.length > 512) return false;
  if (!credentialCache || credentialCache.until < Date.now()) {
    const { data, error } = await db.from("system_configs").select("config_value").eq("config_key", "evolution_webhook_key_sha256").maybeSingle();
    if (error || !/^[a-f0-9]{64}$/.test(data?.config_value || "")) return false;
    credentialCache = { hash: data.config_value, until: Date.now() + 60000 };
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.apikey)));
  const actual = Array.from(digest, n => n.toString(16).padStart(2, "0")).join("");
  return await matchesSecret(actual, credentialCache.hash);
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 32 * 1024 * 1024) return reply({ error: "payload_too_large" }, 413);
    const raw = await req.text();
    if (raw.length > 32 * 1024 * 1024) return reply({ error: "payload_too_large" }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return reply({ error: "invalid_json" }, 400); }
    if (body?.instance !== INSTANCE) return reply({ error: "wrong_instance" }, 403);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    if (!await verifiedProviderKey(body, db)) return reply({ error: "unauthorized" }, 401);
    // Authenticated no-op: validates the route without writing data or sending a message.
    if (body.event === "migration.verify") return reply({ ok: true, receiver: "independent_panel", legacy_bridge: true });
    const incoming = incomingMessage(body);
    if (!incoming) return reply({ ok: true, skipped: true });
    const { data: group, error: groupError } = await db.from("whatsapp_grupos").select("id").eq("group_id", incoming.row.group_id).maybeSingle();
    if (groupError) throw new Error("group_lookup_failed");
    let rowId: string | null = null;
    let retention: any = null;
    if (group) {
      const { data: previous, error: previousError } = await db.from("whatsapp_conversas")
        .select("id,retention:dados_extras->_retention").eq("group_id", incoming.row.group_id)
        .eq("dados_extras->data->key->>id", incoming.providerId).limit(1).maybeSingle();
      if (previousError) throw new Error("duplicate_lookup_failed");
      if (previous) {
        rowId = previous.id; retention = previous.retention;
        // Imported history predates this receiver and has already reached the old Panel.
        if (retention?.legacy_bridge_delivered !== false) return reply({ ok: true, duplicate: true });
      } else {
        rowId = await eventRowId(INSTANCE, incoming.row.group_id, incoming.providerId);
        const { error } = await db.from("whatsapp_conversas").upsert({ id: rowId, ...incoming.row }, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new Error("message_persistence_failed");
        retention = incoming.row.dados_extras._retention;
      }
    }
    // Include events for newly registered legacy clients until the final delta is copied.
    const legacy = await fetch(LEGACY_RECEIVER, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw, signal: AbortSignal.timeout(45000) });
    if (!legacy.ok) return reply({ ok: false, persisted: Boolean(rowId), error: "legacy_bridge_pending" }, 502);
    if (rowId) {
      // Update only the marker, retaining audio and provider metadata already normalized above.
      const { data: saved, error: savedError } = await db.from("whatsapp_conversas").select("dados_extras").eq("id", rowId).single();
      if (savedError) throw new Error("receipt_lookup_failed");
      const { error } = await db.from("whatsapp_conversas").update({ dados_extras: { ...saved.dados_extras,
        _retention: { ...retention, legacy_bridge_delivered: true, legacy_bridge_delivered_at: new Date().toISOString() } } }).eq("id", rowId);
      if (error) throw new Error("receipt_update_failed");
    }
    console.log(JSON.stringify({ event: "panel_message_received", persisted: Boolean(rowId), legacy_delivered: true }));
    return reply({ ok: true, persisted: Boolean(rowId), legacy_delivered: true });
  } catch {
    console.error("panel_ingest_failed");
    return reply({ error: "processing_failed_retry" }, 503);
  }
});
