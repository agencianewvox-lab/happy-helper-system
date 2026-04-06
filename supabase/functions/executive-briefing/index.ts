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
    const openaiKey = Deno.env.get("openai");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check day/time (BRT = UTC-3)
    const now = new Date();
    const brasiliaMs = now.getTime() - 3 * 3600000;
    const brasilia = new Date(brasiliaMs);
    const dayOfWeek = brasilia.getUTCDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return new Response(JSON.stringify({ status: "fim de semana" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const todayStr = brasilia.toISOString().split("T")[0];

    // Check if already sent today
    const { data: existing } = await supabase
      .from("executive_briefings")
      .select("id")
      .eq("briefing_date", todayStr);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ status: "já enviado hoje" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect data
    const todayStartUTC = new Date(`${todayStr}T03:00:00Z`);
    const yesterdayStr = new Date(brasiliaMs - 86400000).toISOString().split("T")[0];

    const [
      { data: grupos },
      { data: predictions },
      { data: feedbackYesterday },
      { data: pendencias },
    ] = await Promise.all([
      supabase.from("whatsapp_grupos").select("*"),
      supabase.from("nps_predictions").select("group_id, nps_score, nps_categoria, tendencia, fator_principal"),
      supabase.from("daily_feedback_log").select("*").eq("feedback_date", yesterdayStr),
      supabase.from("pending_demand_resolutions").select("*").eq("resolved", false),
    ]);

    if (!grupos || grupos.length === 0) {
      return new Response(JSON.stringify({ status: "sem dados" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalClientes = grupos.length;
    const mrrTotal = grupos.reduce((sum: number, g: any) => sum + (g.investimento_ads || 0), 0);

    // NPS data
    const predMap = new Map<string, any>();
    for (const p of (predictions || [])) {
      predMap.set(p.group_id, p);
    }

    const detratores = (predictions || []).filter((p: any) => p.nps_categoria === "detrator");
    const promotores = (predictions || []).filter((p: any) => p.nps_categoria === "promotor");
    const avgNps = predictions && predictions.length > 0
      ? (predictions.reduce((s: number, p: any) => s + p.nps_score, 0) / predictions.length).toFixed(1)
      : "N/A";

    // Top 3 at risk
    const atRisk = detratores
      .map((p: any) => {
        const g = grupos.find((gr: any) => gr.group_id === p.group_id);
        return { ...p, nome: g?.nome || "?", investimento: g?.investimento_ads || 0 };
      })
      .sort((a: any, b: any) => a.nps_score - b.nps_score)
      .slice(0, 3);

    // Top 2 upsell candidates
    const upsellCandidates = promotores
      .map((p: any) => {
        const g = grupos.find((gr: any) => gr.group_id === p.group_id);
        return { ...p, nome: g?.nome || "?", investimento: g?.investimento_ads || 0, data_entrada: g?.data_entrada };
      })
      .sort((a: any, b: any) => b.nps_score - a.nps_score)
      .slice(0, 2);

    const pendenciasAbertas = (pendencias || []).length;

    // Build prompt data
    const dataForAI = `
Dados para o briefing executivo de ${todayStr}:
- Total de clientes ativos: ${totalClientes}
- Investimento total em Ads (MRR estimado): R$ ${mrrTotal.toLocaleString("pt-BR")}
- NPS geral da agência: ${avgNps} | ${promotores.length} promotores | ${detratores.length} detratores
- Pendências abertas: ${pendenciasAbertas}

TOP 3 EM RISCO:
${atRisk.map((r: any) => `- ${r.nome}: NPS ${r.nps_score} (${r.nps_categoria}) | Investimento R$ ${r.investimento} | Problema: ${r.fator_principal || "N/A"}`).join("\n") || "Nenhum detrator identificado"}

CANDIDATOS A UPSELL:
${upsellCandidates.map((u: any) => `- ${u.nome}: NPS ${u.nps_score} | Investimento R$ ${u.investimento} | Cliente desde ${u.data_entrada || "N/A"}`).join("\n") || "Nenhum candidato identificado"}

FEEDBACK DE ONTEM:
${(feedbackYesterday || []).map((f: any) => `- ${f.member_name}: ${f.feedback_message?.slice(0, 100)}`).join("\n") || "Sem feedback registrado"}
`;

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OpenAI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Você é a Vox, consultora estratégica da agência New Vox. Gere um briefing executivo matinal para Alisson e Priscilla (donos da agência). O briefing deve ser objetivo, estratégico e acionável.

FORMATO (máximo 1200 caracteres, é uma mensagem de WhatsApp):

☀️ Bom dia Alisson e Priscilla! Briefing executivo de {data}

💰 OPERAÇÃO:
- {X} clientes ativos | Investimento total R${valor}
- NPS geral: {score} ({promotores} promotores / {detratores} detratores)

🔴 EM RISCO HOJE:
{Top 3 clientes com maior risco + valor investido + problema principal}

⭐ OPORTUNIDADES:
{Top 2 candidatos a upsell + sugestão}

⚠️ AÇÃO HOJE:
{1-2 pontos críticos baseados nos dados}

Estou aqui pro que precisarem! 🤝

REGRAS:
- Máximo 1200 caracteres
- Dados reais, nunca invente
- Tom de parceira estratégica
- Foco em ação, não em relatório`,
          },
          { role: "user", content: dataForAI },
        ],
        max_tokens: 500,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("OpenAI error:", errText);
      return new Response(JSON.stringify({ error: "Erro ao gerar briefing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const briefingContent = aiData.choices?.[0]?.message?.content?.trim() || "";

    if (!briefingContent) {
      return new Response(JSON.stringify({ error: "Briefing vazio" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save briefing
    await supabase.from("executive_briefings").insert({
      briefing_date: todayStr,
      conteudo: briefingContent,
      dados_base: { totalClientes, mrrTotal, avgNps, detratores: detratores.length, promotores: promotores.length, pendenciasAbertas },
    });

    // Send to both masters
    const results: any[] = [];
    for (const [name, webhook] of Object.entries(MASTER_WEBHOOKS)) {
      try {
        const encodedMsg = encodeURIComponent(briefingContent);
        const sendResp = await fetch(`${webhook}?message=${encodedMsg}`);
        console.log(`Briefing sent to ${name}: ${sendResp.status}`);

        // Update sent flag
        const updateField = name === "Alisson" ? "enviado_alisson" : "enviado_priscilla";
        await supabase.from("executive_briefings").update({ [updateField]: true }).eq("briefing_date", todayStr);

        results.push({ name, sent: true });
      } catch (e) {
        console.error(`Failed to send briefing to ${name}:`, e);
        results.push({ name, sent: false });
      }

      // Delay between sends
      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(JSON.stringify({ status: "ok", briefing_date: todayStr, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("executive-briefing error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
