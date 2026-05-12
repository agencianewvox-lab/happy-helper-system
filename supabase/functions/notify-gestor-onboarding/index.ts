import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEBHOOK_URL = "https://bot-n8n.1lxz8u.easypanel.host/webhook/03f12fb5-48ed-4f30-8aaa-02a8912768e3";

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

    // Fetch the group to get gestor_responsavel
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

    // Map gestor_responsavel to profile name to find phone
    const GESTOR_PROFILE_MAP: Record<string, string> = {
      "Murilo Araújo": "Murillo",
      "Netto Monge": "Netto",
      "Jader Costa": "Jader",
      "Priscilla Borges": "Priscilla",
    };

    const profileName = GESTOR_PROFILE_MAP[gestorName] || gestorName;

    // Find the gestor's phone number from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("telefone, full_name")
      .eq("full_name", profileName)
      .single();

    const gestorPhone = profile?.telefone;
    const clientDisplayName = client_name || grupo.nome;

    // Build the notification message
    const message = `🆕 *Novo Onboarding Preenchido!*

O cliente *${clientDisplayName}* acabou de preencher o formulário de onboarding.

📋 *Próximo passo:* Agendar a call de onboarding com o cliente o mais rápido possível.

👉 Acesse o painel para ver as respostas completas e agende a reunião!`;

    // Send WhatsApp message to the gestor's phone if available
    if (gestorPhone) {
      try {
        const phoneUrl = new URL(WEBHOOK_URL);
        // Using common parameter names to be safe, though N8N node 'Grupo' suggests it might expect specific fields
        phoneUrl.searchParams.set("phone", gestorPhone);
        phoneUrl.searchParams.set("message", message);
        
        const response = await fetch(phoneUrl.toString(), { method: "GET" });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`N8N error (${response.status}):`, errorText);
        } else {
          console.log(`Notification sent to gestor ${gestorName} (${gestorPhone})`);
        }
      } catch (phoneErr) {
        console.error("Failed to send phone notification:", phoneErr);
      }
    }

    // Auto-create a task for the gestor to schedule the onboarding call
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
      console.log(`Task created for ${gestorName} to schedule onboarding call`);
    } catch (taskErr) {
      console.error("Failed to create task:", taskErr);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
