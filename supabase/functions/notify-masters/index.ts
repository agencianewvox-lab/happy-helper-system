import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Master webhooks
const MASTER_WEBHOOKS: Record<string, string> = {
  "Alisson": "https://bot-n8n.1lxz8u.easypanel.host/webhook/b833f73e-af8f-4231-85de-1ec473e52dcd",
  "Priscilla": "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
};

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

    // Throttling: check if same tipo + group_id was sent in last 4 hours
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    let throttleQuery = supabase
      .from("master_notifications")
      .select("id")
      .eq("tipo", tipo)
      .gte("enviada_em", fourHoursAgo);

    if (group_id) {
      throttleQuery = throttleQuery.eq("group_id", group_id);
    }

    const { data: existing } = await throttleQuery;
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ status: "throttled", message: "Notificação similar já enviada nas últimas 4h" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const [name, webhook] of Object.entries(MASTER_WEBHOOKS)) {
      try {
        const fullMessage = `🔔 *${titulo}*\n\n${mensagem}`;
        const encodedMsg = encodeURIComponent(fullMessage);
        const sendResp = await fetch(`${webhook}?message=${encodedMsg}`);
        console.log(`Notification sent to ${name}: ${sendResp.status}`);

        // Log notification
        await supabase.from("master_notifications").insert({
          destinatario: name,
          tipo,
          titulo,
          mensagem,
          group_id: group_id || null,
          dados_relacionados: dados_extras || {},
        });

        results.push({ name, sent: true });
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
