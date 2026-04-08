const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cnpj, group_id, is_owner_or_partner, responsible_name, responsible_birthday } = await req.json();

    if (!group_id) {
      return new Response(JSON.stringify({ error: "group_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const updateData: Record<string, unknown> = {};

    // If owner or partner, set responsible master and birthday
    if (is_owner_or_partner) {
      if (responsible_name) {
        updateData.responsavel_master = responsible_name;
      }
      if (responsible_birthday) {
        // Try to parse date from various formats: "15/03", "03/15", "Março", etc.
        // Store as text in a notes-friendly way - the column is date type
        // Try DD/MM format
        const ddmm = responsible_birthday.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
        if (ddmm) {
          const day = ddmm[1].padStart(2, '0');
          const month = ddmm[2].padStart(2, '0');
          updateData.aniversario_cliente = `2000-${month}-${day}`;
        }
        // Try DD/MM/YYYY
        const full = responsible_birthday.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (full) {
          updateData.aniversario_cliente = `${full[3]}-${full[2].padStart(2,'0')}-${full[1].padStart(2,'0')}`;
        }
      }
    }

    // Lookup CNPJ for company birthday
    if (cnpj) {
      const cleanCnpj = cnpj.replace(/\D/g, "");
      if (cleanCnpj.length === 14) {
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
          if (res.ok) {
            const data = await res.json();
            if (data.data_inicio_atividade) {
              updateData.aniversario_empresa = data.data_inicio_atividade;
            }
          }
        } catch (e) {
          console.error("CNPJ API error:", e.message);
        }
      }
    }

    // Apply updates if any
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("whatsapp_grupos")
        .update(updateData)
        .eq("group_id", group_id);

      if (updateError) {
        console.error("Update error:", updateError);
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      updated_fields: Object.keys(updateData),
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
