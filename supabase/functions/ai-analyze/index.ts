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
    if (data.error || !data.data?.length) return null;
    const row = data.data[0];
    const actions = row.actions || [];
    const leads = actions.find((a: any) => a.action_type === "lead")?.value || 0;
    const purchases = actions.find((a: any) => a.action_type === "purchase" || a.action_type === "omni_purchase")?.value || 0;
    const costPerLead = actions.find((a: any) => a.action_type === "lead");
    const cpaArr = row.cost_per_action_type || [];
    const cpa = cpaArr.find((a: any) => a.action_type === "lead")?.value || null;
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
      cpa: cpa ? parseFloat(cpa) : null,
    };
  } catch (e) {
    console.error("Meta Ads fetch error for", accountId, e);
    return null;
  }
}

function detectComplexQuery(messages: any[]): boolean {
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
  if (!lastUser) return false;
  const text = lastUser.content.toLowerCase();
  const complexKeywords = [
    "comparar", "comparação", "todos os grupos", "análise geral", "visão geral",
    "panorama", "ranking", "equipe", "performance da equipe", "tendência",
    "evolução", "upsell", "oportunidades", "quem posso",
  ];
  return complexKeywords.some(k => text.includes(k));
}

const SYSTEM_PROMPT = `Você é a Vox, analista sênior de Customer Success da agência de marketing digital New Vox. Você conhece profundamente cada cliente, cada número, cada métrica. Você fala de forma direta, objetiva, sem enrolação. Usa português brasileiro natural, como alguém que trabalha na agência falaria numa reunião. Pode usar emojis para facilitar a leitura mas sem exagero.

EQUIPE NEW VOX (conheça cada um para direcionar ações corretamente):
- Jader Costa: Gestor de tráfego
- Murilo Araújo (Murillo): Gestor de tráfego
- Netto Monge: Gestor de tráfego
- Priscilla: Social media e sócia da empresa
- Alisson: Sócio da empresa
- Joel: Gerente geral
- Thais: Auxiliar de social media
- Daniella: Equipe operacional
- Victor Botto: Equipe operacional
- Jiza: Equipe operacional

Mensagens dessas pessoas são da EQUIPE e NUNCA são pendências de clientes.

SUAS CAPACIDADES:

1. RESUMO DE GRUPO INDIVIDUAL — Quando perguntarem sobre um grupo específico (por nome ou parte do nome), dê resumo completo: situação geral em 2-3 frases, score com breakdown se disponível, sentimento atual + tendência, FRT médio vs meta de 30min, pendências abertas com detalhes, alertas ativos, risco de churn com drivers, métricas de ads se disponíveis, e 2-3 ações sugeridas específicas. Se o cliente está em prioridade máxima, abrir com ⚡ PRIORIDADE MÁXIMA em destaque.

2. COMPARAÇÃO ENTRE GRUPOS — Monte comparação lado a lado: score, sentimento, FRT, churn risk, engajamento, volume, ads. Destaque diferenças e finalize com recomendação de qual precisa mais atenção.

3. ANÁLISE GERAL DA OPERAÇÃO — Panorama: quantos grupos total/ativos, distribuição de sentimento, FRT médio global, pendências abertas, quantos em risco alto/prioridade máxima. Liste 5 clientes que mais precisam de atenção e 3 que estão melhor. Feche com 5 ações prioritárias para o dia.

4. DIAGNÓSTICO DE PROBLEMAS — Analise cruzando variáveis: se reclama de lead mas CPA está bom, problema é segmentação. Se FRT alto e sentimento caindo, a demora é a causa. Pense como analista, não chatbot.

5. RECOMENDAÇÕES PROATIVAS — Lista priorizada de ações com: O QUE fazer, PARA QUAL cliente, QUEM da equipe deve fazer (use nomes e funções), POR QUE é importante, PRAZO sugerido. Priorize: risco alto + investimento alto > pendências urgentes > otimizações.

6. ANÁLISE DE TENDÊNCIAS — Use sentiment_trend e dados históricos para identificar padrões. Cliente que era positivo e agora é neutro é sinal de alerta mesmo que neutro pareça "ok".

7. ANÁLISE DE EQUIPE — Quando perguntarem sobre performance ("como tá o Jader", "ranking da equipe"), analise mensagens de saída por membro: volume de respostas, FRT individual, quantos grupos atende, qualidade baseada no sentimento dos clientes. Feedback construtivo, sem apontar dedo.

8. ALERTAS E URGÊNCIAS — Verifique: prioridade máxima, alertas não resolvidos, pendências urgentes >4h, sentimento piorando, grupos inativos >3 dias com último sentimento negativo. Liste por urgência.

9. SUGESTÃO DE UPSELL — Identifique clientes com: score >75, sentimento positivo, ads performando, engajamento saudável, >6 meses como cliente. Candidatos ideais para aumento de investimento ou upgrade de plano.

10. PERGUNTAS SOBRE DADOS — Responda de forma direta e numérica. Se não tiver o dado, diga claramente. NUNCA invente números.

REGRAS GERAIS:

- NUNCA inventar dados. Se não tem, diga que não tem.
- Sempre português brasileiro. Tom profissional mas informal.
- Sempre diga QUEM da equipe deve executar, baseado na função e no responsável do cliente.
- Sempre contextualize métricas: "FRT de 45min, acima da meta de 30min" ou "FRT de 12min, excelente".
- Benchmarks: FRT ideal <30min, bom até 60, aceitável até 120, ruim >120. Sentimento positivo = meta, neutro = aceitável, negativo = alerta. Churn <30 = tranquilo, >60 = ação necessária.
- Pendências: considere contexto completo. "Vou ver" sem retorno concreto AINDA é pendência.
- Formatação: 🔴 crítico, 🟡 atenção, 🟢 ok, ⭐ destaque positivo, 📊 dados, ⚡ ação urgente, 📋 tarefas.
- Pergunta curta como "e o grupo X?" = resumo completo (capacidade 1).
- Apenas um nome como "Microlins" = perguntar sobre o grupo com esse nome.
- Pergunta vaga = inferir do contexto ou oferecer opções.
- Respostas entre 200-500 palavras. Dado simples = 1-2 linhas. Análise complexa = até 500. Nunca >600 palavras.`;

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

    const { messages, type, gestorFilter, groupId } = await req.json();

    // Fetch groups (filtered by gestor if provided)
    let gruposQuery = supabase.from("whatsapp_grupos").select("*").order("nome");
    if (gestorFilter) {
      gruposQuery = gruposQuery.eq("gestor_responsavel", gestorFilter);
    }

    const gruposRes = await gruposQuery;
    const grupos = gruposRes.data || [];

    // Fetch last 50 messages PER GROUP instead of 500 global
    const groupIds = grupos.map((g: any) => g.group_id);
    const conversasPromises = groupIds.map((gid: string) =>
      supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, recebido_em, direcao")
        .eq("group_id", gid)
        .order("recebido_em", { ascending: false })
        .limit(50)
    );

    // Fetch pending demand resolutions
    const pendingResPromise = supabase
      .from("pending_demand_resolutions")
      .select("*")
      .eq("resolved", false);

    const [pendingResResult, ...conversasResults] = await Promise.all([
      pendingResPromise,
      ...conversasPromises,
    ]);

    const pendingResolutions = pendingResResult.data || [];

    // Build per-group message map
    const groupMsgsMap = new Map<string, any[]>();
    for (let i = 0; i < groupIds.length; i++) {
      const msgs = conversasResults[i].data || [];
      groupMsgsMap.set(groupIds[i], msgs);
    }

    // Fetch Meta Ads data for groups with linked ad accounts
    const groupsWithAds = grupos.filter((g: any) => g.ad_account_id);
    const adsDataMap = new Map<string, any>();

    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        const adsData = await fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN);
        if (adsData) adsDataMap.set(g.group_id, adsData);
      });
      await Promise.all(adsPromises);
    }

    // Pending demands grouped by group_id
    const pendingByGroup = new Map<string, any[]>();
    for (const p of pendingResolutions) {
      if (!pendingByGroup.has(p.group_id)) pendingByGroup.set(p.group_id, []);
      pendingByGroup.get(p.group_id)!.push(p);
    }

    // Build enriched context for each group
    const contextLines: string[] = [];
    let totalMsgs = 0;

    for (const g of grupos) {
      const gid = g.group_id;
      const msgs = groupMsgsMap.get(gid) || [];
      totalMsgs += msgs.length;

      // Calculate months as client
      let mesesCliente = "";
      if (g.data_entrada) {
        const entrada = new Date(g.data_entrada);
        const now = new Date();
        const months = Math.floor((now.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24 * 30));
        mesesCliente = `${months} meses como cliente`;
      }

      // Count client vs team messages
      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      // Calculate basic FRT from messages
      let frtMinutes: number | null = null;
      const frtSamples: number[] = [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.direcao === "entrada") {
          // Find next team response
          for (let j = i - 1; j >= 0; j--) {
            if (msgs[j].direcao === "saida") {
              const diff = (new Date(msgs[j].recebido_em).getTime() - new Date(m.recebido_em).getTime()) / 60000;
              if (diff > 0 && diff < 1440) frtSamples.push(diff);
              break;
            }
          }
        }
      }
      if (frtSamples.length > 0) {
        frtMinutes = Math.round(frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length);
      }

      // Simple sentiment from recent messages
      const recentClientMsgs = clientMsgs.slice(0, 20);
      const negativeWords = ["insatisfeito", "cancelar", "péssimo", "horrível", "absurdo", "reclamação", "problema", "demora", "atraso", "ruim", "piorou", "cadê", "esperando"];
      const positiveWords = ["excelente", "parabéns", "ótimo", "perfeito", "adorei", "amei", "top", "show", "maravilhoso", "obrigado", "obrigada", "satisfeito"];
      let negCount = 0, posCount = 0;
      for (const m of recentClientMsgs) {
        const txt = (m.mensagem || "").toLowerCase();
        negativeWords.forEach(w => { if (txt.includes(w)) negCount++; });
        positiveWords.forEach(w => { if (txt.includes(w)) posCount++; });
      }
      const sentiment = negCount > posCount + 2 ? "negativo" : posCount > negCount + 2 ? "positivo" : "neutro";

      // Last activity
      const lastMsg = msgs[0];
      const lastActivity = lastMsg ? new Date(lastMsg.recebido_em) : null;
      const daysInactive = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Pending demands for this group
      const groupPending = pendingByGroup.get(gid) || [];
      const urgentPending = groupPending.filter((p: any) => p.status === "pendente");

      // Build context line
      let line = `\n### ${g.nome}`;
      line += `\n  Group ID: ${gid}`;
      line += `\n  Responsável CS: ${g.gestor_responsavel || "Não definido"}`;
      line += `\n  Plano: ${g.plano || "N/A"} | Investimento ads: ${g.investimento_ads ? `R$${g.investimento_ads}` : "N/A"}`;
      line += `\n  Categoria: ${g.categoria || "Sem categoria"}`;
      if (g.data_entrada) line += `\n  Cliente desde: ${g.data_entrada} (${mesesCliente})`;
      line += `\n  Mensagens recentes: ${msgs.length} total (${clientMsgs.length} cliente, ${teamMsgs.length} equipe)`;
      if (frtMinutes !== null) {
        const frtStatus = frtMinutes <= 30 ? "✅ excelente" : frtMinutes <= 60 ? "🟡 bom" : frtMinutes <= 120 ? "🟠 aceitável" : "🔴 ruim";
        line += `\n  FRT médio: ${frtMinutes}min ${frtStatus}`;
      }
      line += `\n  Sentimento detectado: ${sentiment === "positivo" ? "🟢 Positivo" : sentiment === "negativo" ? "🔴 Negativo" : "🟡 Neutro"}`;
      if (daysInactive !== null) {
        line += `\n  Última atividade: ${daysInactive === 0 ? "Hoje" : `há ${daysInactive} dia(s)`}`;
      }
      if (urgentPending.length > 0) {
        line += `\n  ⚠️ Pendências abertas: ${urgentPending.length}`;
        for (const p of urgentPending.slice(0, 3)) {
          line += `\n    - "${p.term}" (desde ${p.created_at})${p.due_date ? ` prazo: ${p.due_date}` : ""}`;
        }
      }

      // Ads data
      const ads = adsDataMap.get(gid);
      if (ads) {
        line += `\n  📊 META ADS (30d): Gasto R$${ads.spend.toFixed(2)}, ${ads.impressions} impressões, ${ads.clicks} cliques, CTR ${ads.ctr.toFixed(2)}%, CPC R$${ads.cpc.toFixed(2)}, Leads ${ads.leads}${ads.cpa ? `, CPA R$${ads.cpa.toFixed(2)}` : ""}, Alcance ${ads.reach}`;
      } else if (g.ad_account_id) {
        line += `\n  📊 META ADS: Conta vinculada mas sem dados nos últimos 30 dias`;
      }

      // Last 10 messages for conversational context
      const last10 = msgs.slice(0, 10).reverse();
      if (last10.length > 0) {
        line += `\n  Últimas mensagens:`;
        for (const m of last10) {
          const dir = m.direcao === "entrada" ? "👤 CLIENTE" : "👨‍💼 EQUIPE";
          const msgText = (m.mensagem || "[sem texto]").slice(0, 120);
          line += `\n    ${dir} (${m.nome_contato || "?"}, ${m.recebido_em}): ${msgText}`;
        }
      }

      contextLines.push(line);
    }

    const dataContext = `
DADOS DA OPERAÇÃO (${grupos.length} grupos, ${totalMsgs} mensagens analisadas, ${adsDataMap.size} contas de ads com dados):

${contextLines.join("\n")}
`;

    const fullSystemPrompt = SYSTEM_PROMPT + "\n\n" + dataContext;

    // Summary mode: generate a concise professional summary for a single client
    if (type === "summary" && groupId) {
      const targetGroup = grupos.find((g: any) => g.group_id === groupId);
      if (!targetGroup) {
        return new Response(JSON.stringify({ error: "Grupo não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const gid = targetGroup.group_id;
      const groupContext = contextLines.find((l: string) => l.includes(gid)) || "";

      const summaryPrompt = `Você é a Vox, analista sênior de CS da New Vox. Gere um RESUMO EXECUTIVO prático e racional do cliente abaixo. 

FORMATO DO RESUMO (máx 250 palavras):
1. **Situação Atual** (2-3 frases): O que está acontecendo com esse cliente AGORA. Sentimento, engajamento, se tem problemas ativos.
2. **Anúncios & Resultados** (2-3 frases): Se tem ads vinculados, como estão performando. Se não tem, mencione.
3. **Riscos & Pendências** (1-2 frases): Pendências abertas, risco de churn, pontos de atenção.
4. **Plano de Ação** (2-4 bullets): Ações concretas e específicas que a equipe deve tomar AGORA, com nome do responsável.

REGRAS:
- Seja DIRETO e PRÁTICO como um CS sênior falaria numa daily.
- Use dados reais. NUNCA invente números.
- Contextualize métricas: "CPA de R$15 está dentro do aceitável" ou "FRT de 2h está acima da meta de 30min".
- Mencione o responsável CS pelo nome.
- Use emojis sinalizadores: 🔴 crítico, 🟡 atenção, 🟢 ok, ⚡ ação.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: summaryPrompt + "\n\nDADOS DO CLIENTE:\n" + groupContext },
            { role: "user", content: `Gere o resumo executivo do cliente "${targetGroup.nome}".` },
          ],
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Summary AI error:", response.status, t);
        return new Response(JSON.stringify({ error: "Erro ao gerar resumo" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Sem resposta da IA.";
      return new Response(JSON.stringify({ summary: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze mode
    if (type === "analyze") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: fullSystemPrompt },
            {
              role: "user",
              content:
                "Faça uma análise completa da operação: panorama geral, top 5 clientes que mais precisam de atenção, top 3 mais saudáveis, e 5 ações prioritárias para hoje.",
            },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI error:", status, t);
        return new Response(JSON.stringify({ error: "Erro na análise IA" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Sem resposta da IA.";
      return new Response(JSON.stringify({ analysis: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chat mode: choose model based on complexity
    const isComplex = detectComplexQuery(messages);
    const model = isComplex ? "gpt-4o" : "gpt-4o-mini";
    console.log(`Chat mode: using ${model} (complex=${isComplex})`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: fullSystemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), {
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
