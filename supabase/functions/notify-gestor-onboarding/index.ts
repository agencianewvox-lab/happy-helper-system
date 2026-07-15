import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsApp, lookupTeamPhone } from "../_shared/evolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, client_name } = await req.json();

    if (!group_id) {
      return new Response(JSON.stringify({ error: "group_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: grupo, error: grupoError } = await supabase
      .from("whatsapp_grupos")
      .select("nome, gestor_responsavel")
      .eq("group_id", group_id)
      .single();

    if (grupoError || !grupo) {
      console.error("Group not found:", grupoError);
      return new Response(JSON.stringify({ error: "Group not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gestorName = grupo.gestor_responsavel;
    if (!gestorName) {
      console.log("No gestor_responsavel set for group", group_id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_gestor" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map gestor_responsavel to profile name
    const GESTOR_PROFILE_MAP: Record<string, string> = {
      "Murilo Araújo": "Murillo",
      "Netto Monge": "Netto",
      "Jader Costa": "Jader",
      "Priscilla Borges": "Priscilla",
    };

    const profileName = GESTOR_PROFILE_MAP[gestorName] || gestorName;
    const gestorPhone = await lookupTeamPhone(supabase, [profileName, gestorName]);
    const clientDisplayName = client_name || grupo.nome;

    // Message for the GROUP
    const groupMessage = `🆕 *Onboarding Preenchido!*

O formulário de onboarding para *${clientDisplayName}* foi preenchido com sucesso.

🚀 *Próximo passo:* Time, vamos agendar a call de alinhamento o quanto antes!`;

    const groupResult = await sendWhatsApp(group_id, groupMessage);
    if (!groupResult.ok) {
      console.error(`Failed to send onboarding notice to group ${group_id}`, groupResult);
    }

    // Optional private notification to gestor
    if (gestorPhone) {
      const gestorMessage = `🆕 *Novo Onboarding Preenchido!* (Privado)\n\nO cliente *${clientDisplayName}* preencheu o formulário. Acabei de avisar no grupo do cliente também.`;
      await sendWhatsApp(gestorPhone, gestorMessage);
    } else {
      console.log(`No phone for gestor ${profileName} — skipping private notice`);
    }

    // Auto-create task
    try {
      await supabase.from("tasks").insert({
        title: `Agendar call de onboarding — ${clientDisplayName}`,
        description: `O cliente ${clientDisplayName} preencheu o formulário de onboarding. Agende a call de alinhamento o mais rápido possível.`,
        assigned_to: gestorName,
        group_id: group_id,
        priority: "alta",
        status: "pendente",
        created_by: "Sistema (Onboarding Automático)",
      });
    } catch (taskErr) {
      console.error("Failed to create task:", taskErr);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
