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
    const OPENAI_API_KEY = Deno.env.get("openai");
    if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { messages, type } = await req.json();

    // Fetch all groups and recent conversations for context
    const [gruposRes, conversasRes] = await Promise.all([
      supabase.from("whatsapp_grupos").select("*").order("nome"),
      supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, created_at, direcao")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const grupos = gruposRes.data || [];
    const conversas = conversasRes.data || [];

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
      contextLines.push(
        `- ${info.nome} [${info.categoria}]: ${info.msgs.length} mensagens` +
          (lastMsg ? `, última: "${lastMsg.mensagem}" por ${lastMsg.nome_contato} em ${lastMsg.created_at}` : ", sem mensagens")
      );
    }

    const dataContext = `
DADOS DOS GRUPOS DE WHATSAPP (${grupos.length} grupos, ${conversas.length} mensagens recentes):

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

Responda sempre em português brasileiro, de forma objetiva e acionável. Use emojis para facilitar a leitura.
Quando listar scores, use o formato: "Nome do Grupo: XX/100 - observação".
Quando detectar alertas, classifique como 🔴 Crítico, 🟡 Atenção, 🟢 OK.`;

    // If type is "analyze", do a one-shot analysis with tool calling for structured output
    if (type === "analyze") {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
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
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
