import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function fetchMetaAdsForAccount(accountId: string, token: string): Promise<any | null> {
  try {
    const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const fields = "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,reach,frequency";
    const url = `${META_BASE}/${actId}/insights?fields=${fields}&date_preset=last_30d&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log(`Meta API response for ${actId}:`, JSON.stringify({ error: data.error, hasData: !!data.data?.length }));
    if (data.error || !data.data?.length) return null;
    const row = data.data[0];
    const actions = row.actions || [];
    const leads = actions.find((a: any) => a.action_type === "lead")?.value || 0;
    const purchases = actions.find((a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase")?.value || 0;
    return {
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0"),
      clicks: parseInt(row.clicks || "0"),
      ctr: parseFloat(row.ctr || "0"),
      cpc: parseFloat(row.cpc || "0"),
      cpm: parseFloat(row.cpm || "0"),
      reach: parseInt(row.reach || "0"),
      frequency: parseFloat(row.frequency || "0"),
      leads: parseInt(leads),
      purchases: parseInt(purchases),
    };
  } catch (e) {
    console.error("Meta Ads fetch error for", accountId, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("openai");
    if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");

    const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { messages, type, gestorFilter } = await req.json();

    // Fetch groups (filtered by gestor if provided) and recent conversations
    let gruposQuery = supabase.from("whatsapp_grupos").select("*").order("nome");
    if (gestorFilter) {
      gruposQuery = gruposQuery.eq("gestor_responsavel", gestorFilter);
    }

    const [gruposRes, conversasRes] = await Promise.all([
      gruposQuery,
      supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, created_at, direcao")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const grupos = gruposRes.data || [];
    const conversas = conversasRes.data || [];

    // Fetch Meta Ads data for groups with linked ad accounts
    const groupsWithAds = grupos.filter((g: any) => g.ad_account_id);
    const adsDataMap = new Map<string, any>();
    const adsLinkedGroups = new Map<string, string>(); // group_id -> ad_account_id
    
    console.log(`Found ${groupsWithAds.length} groups with ad accounts, META_TOKEN available: ${!!META_TOKEN}`);
    
    for (const g of groupsWithAds) {
      adsLinkedGroups.set(g.group_id, g.ad_account_id);
    }
    
    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        console.log(`Fetching ads for group "${g.nome}" account ${g.ad_account_id}`);
        const adsData = await fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN);
        console.log(`Ads result for "${g.nome}":`, adsData ? "has data" : "no data");
        if (adsData) adsDataMap.set(g.group_id, adsData);
      });
      await Promise.all(adsPromises);
    }

    // Build context summary
    const groupMap = new Map<string, { nome: string; categoria: string; msgs: any[] }>();
    for (const g of grupos) {
      groupMap.set(g.group_id, { nome: g.nome, categoria: g.categoria || "Sem categoria", msgs: [] });
    }
    for (const c of conversas) {
      if (c.group_id && groupMap.has(c.group_id)) {
        groupMap.get(c.group_id)!.msgs.push(c);
      }
    }

    const contextLines: string[] = [];
    for (const [gid, info] of groupMap) {
      const lastMsg = info.msgs[0];
      let line = `- ${info.nome} [${info.categoria}]: ${info.msgs.length} mensagens` +
        (lastMsg ? `, última: "${lastMsg.mensagem}" por ${lastMsg.nome_contato} em ${lastMsg.created_at}` : ", sem mensagens");
      
      // Add Meta Ads data if available
      const ads = adsDataMap.get(gid);
      const linkedAccount = adsLinkedGroups.get(gid);
      if (ads) {
        line += ` | 📊 META ADS (últimos 30 dias): Investimento R$${ads.spend.toFixed(2)}, ${ads.impressions} impressões, ${ads.clicks} cliques, CTR ${ads.ctr.toFixed(2)}%, CPC R$${ads.cpc.toFixed(2)}, CPM R$${ads.cpm.toFixed(2)}, Alcance ${ads.reach}, Frequência ${ads.frequency.toFixed(2)}, Leads ${ads.leads}, Compras ${ads.purchases}`;
      } else if (linkedAccount) {
        line += ` | 📊 META ADS: Conta vinculada (ID: ${linkedAccount}) mas sem dados de gastos nos últimos 30 dias`;
      }
      contextLines.push(line);
    }

    const dataContext = `
DADOS DOS GRUPOS DE WHATSAPP (${grupos.length} grupos, ${conversas.length} mensagens recentes, ${adsDataMap.size} contas de anúncios vinculadas):

${contextLines.join("\n")}
`;

    const systemPrompt = `Você é um analista de Customer Success especializado em agências de marketing digital. 
Você tem acesso aos dados de grupos de WhatsApp de clientes.

EQUIPE NEW VOX (mensagens desses nomes são da equipe, NÃO são pendências de clientes):
- Jader: Gestor de tráfego
- Murillo: Gestor de tráfego
- Priscilla: Social media e sócia da empresa
- Alisson: Sócio da empresa
- Joel: Gerente geral
- Thais: Auxiliar de social media
- Daniella: Equipe
- Victor Botto: Equipe

IMPORTANTE: Ao analisar pendências, IGNORE mensagens enviadas por membros da equipe listados acima. Apenas mensagens de CLIENTES devem ser consideradas como pendências.

${dataContext}

Suas capacidades:
1. RESUMO POR GRUPO: Analise as mensagens e gere resumos do que está acontecendo em cada grupo.
2. SCORE DE ENGAJAMENTO: Calcule um score de 0-100 para cada grupo baseado em volume de mensagens, frequência e participação.
3. ALERTAS INTELIGENTES: Detecte grupos inativos, possíveis reclamações, riscos de churn.
4. ANÁLISE GERAL: Responda perguntas sobre os dados.
5. ANÁLISE DE META ADS: Para clientes com conta de anúncios vinculada, analise métricas como investimento, CTR, CPC, CPM, alcance, leads e compras. Identifique campanhas com bom/mau desempenho, sugira otimizações de orçamento, detecte anomalias de custo e compare resultados entre clientes.

Quando perguntarem sobre resultados, métricas, performance ou anúncios de um cliente, use os dados de Meta Ads disponíveis para dar uma análise completa incluindo:
- Eficiência do investimento (CPC, CPM, CPA)
- Volume de resultados (leads, compras, conversões)
- Engajamento (CTR, alcance, frequência)
- Recomendações práticas de otimização

Responda sempre em português brasileiro, de forma objetiva e acionável. Use emojis para facilitar a leitura.
Quando listar scores, use o formato: "Nome do Grupo: XX/100 - observação".
Quando detectar alertas, classifique como 🔴 Crítico, 🟡 Atenção, 🟢 OK.
Quando analisar ads, use indicadores visuais: 📈 Bom desempenho, 📉 Precisa atenção, 💰 Custo alto, 🎯 Boa conversão.`;

    // If type is "analyze", do a one-shot analysis with tool calling for structured output
    if (type === "analyze") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                "Faça uma análise completa: 1) Resumo geral da situação, 2) Top 5 grupos mais engajados com score, 3) Alertas de grupos inativos ou com risco, 4) Recomendações de ação imediata.",
            },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Configurações > Workspace > Uso." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI error:", status, t);
        return new Response(JSON.stringify({ error: "Erro na análise IA" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Sem resposta da IA.";
      return new Response(JSON.stringify({ analysis: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chat mode: stream response
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", status, t);
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("Erro:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
