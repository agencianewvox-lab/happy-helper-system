import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsApp, lookupTeamPhone } from "../_shared/evolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASTER_NAMES = ["Alisson", "Priscilla"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { tipo, titulo, mensagem, group_id, dados_extras } = await req.json();

    if (!tipo || !titulo || !mensagem) {
      return new Response(JSON.stringify({ error: "tipo, titulo e mensagem são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Throttling: same tipo + group_id within last 4h
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    let throttleQuery = supabase
      .from("master_notifications")
      .select("id")
      .eq("tipo", tipo)
      .gte("enviada_em", fourHoursAgo);

    if (group_id) throttleQuery = throttleQuery.eq("group_id", group_id);

    const { data: existing } = await throttleQuery;
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ status: "throttled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const name of MASTER_NAMES) {
      try {
        const phone = await lookupTeamPhone(supabase, [name]);
        if (!phone) {
          console.warn(`[notify-masters] No phone for ${name} — skipping`);
          results.push({ name, sent: false, error: "no_phone" });
          continue;
        }

        const fullMessage = `🔔 *${titulo}*\n\n${mensagem}`;
        const sendResp = await sendWhatsApp(phone, fullMessage);
        console.log(`Notification to ${name}: ${sendResp.status}`);

        await supabase.from("master_notifications").insert({
          destinatario: name,
          tipo,
          titulo,
          mensagem,
          group_id: group_id || null,
          dados_relacionados: dados_extras || {},
        });

        results.push({ name, sent: sendResp.ok });
      } catch (e) {
        console.error(`Failed to notify ${name}:`, e);
        results.push({ name, sent: false, error: e instanceof Error ? e.message : "Unknown" });
      }
    }

    return new Response(JSON.stringify({ status: "ok", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-masters error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
