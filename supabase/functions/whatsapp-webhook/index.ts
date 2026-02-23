import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    // Suporta payload único ou array de mensagens
    const mensagens = Array.isArray(body) ? body : [body];

    // Remove prefixo "=" que o n8n pode adicionar nos valores
    const clean = (val: any) =>
      typeof val === "string" && val.startsWith("=") ? val.slice(1) : val;

    const registros = mensagens.map((msg: any) => ({
      telefone: clean(msg.telefone || msg.phone || msg.from) || null,
      nome_contato: clean(msg.nome_contato || msg.name || msg.pushName) || null,
      mensagem: clean(msg.mensagem || msg.message || msg.text || msg.body) || null,
      group_id: clean(msg.group_id) || null,
      direcao: clean(msg.direcao || msg.direction) || "entrada",
      status: clean(msg.status) || "recebida",
      dados_extras: msg,
    }));

    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .insert(registros)
      .select();

    if (error) {
      console.error("Erro ao inserir:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: data.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Erro no webhook:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
