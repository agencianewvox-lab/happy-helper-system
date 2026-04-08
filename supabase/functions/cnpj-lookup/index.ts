import { corsHeaders } from '@supabase/supabase-js/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cnpj, group_id } = await req.json();

    if (!cnpj || !group_id) {
      return new Response(JSON.stringify({ error: "cnpj and group_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean CNPJ - remove non-numeric chars
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup CNPJ via public API
    let abertura: string | null = null;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (res.ok) {
        const data = await res.json();
        // data.data_inicio_atividade is in format "YYYY-MM-DD"
        if (data.data_inicio_atividade) {
          abertura = data.data_inicio_atividade;
        }
      }
    } catch (e) {
      console.error("CNPJ API error:", e.message);
    }

    // Update whatsapp_grupos with company birthday if found
    if (abertura) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error: updateError } = await supabase
        .from("whatsapp_grupos")
        .update({ aniversario_empresa: abertura })
        .eq("group_id", group_id);

      if (updateError) {
        console.error("Update error:", updateError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data_abertura: abertura 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
