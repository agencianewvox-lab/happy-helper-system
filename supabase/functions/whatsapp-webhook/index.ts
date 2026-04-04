import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Alisson's phone for AI auto-reply (with country-code and 9th-digit variations)
const ALISSON_PHONES = ["64992565779", "5564992565779"];
const ALISSON_WEBHOOK_URL = "https://bot-n8n.1lxz8u.easypanel.host/webhook/b833f73e-af8f-4231-85de-1ec473e52dcd";

function digitsOnly(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

function getBrazilPhoneVariants(phone: string | null | undefined): string[] {
  const digits = digitsOnly(phone);
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;

  if (local) {
    variants.add(local);

    if (local.length === 11 && local[2] === "9") {
      variants.add(`${local.slice(0, 2)}${local.slice(3)}`);
    }

    if (local.length === 10) {
      variants.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
  }

  for (const variant of [...variants]) {
    if (!variant.startsWith("55")) {
      variants.add(`55${variant}`);
    }
  }

  return [...variants];
}

function isKnownPhone(candidate: string | null | undefined, knownPhones: string[]): boolean {
  const candidateVariants = new Set(getBrazilPhoneVariants(candidate));
  return knownPhones.some((phone) =>
    getBrazilPhoneVariants(phone).some((variant) => candidateVariants.has(variant))
  );
}

const ALISSON_PHONE_FILTERS = [...new Set(ALISSON_PHONES.flatMap((phone) => getBrazilPhoneVariants(phone)))]
  .map((phone) => `telefone.eq.${phone}`);

// Messages that should NOT trigger AI response
const IGNORE_PATTERNS = [
  /^(ok|sim|não|nao|certo|beleza|combinado|pode ser|tá bom|ta bom|tá|ta|blz|vlw|valeu|top|show|perfeito|obrigado|obrigada|bom dia|boa tarde|boa noite|oi|olá|ola)$/i,
  /^[\p{Emoji}\s]+$/u,
  /^\[Figurinha\]$/,
  /^\[Imagem\]$/,
  /^\[Vídeo\]$/,
  /^\[Áudio\]$/,
  /^\[Documento\]/,
  /^\[Contato\]$/,
  /^\[Localização\]$/,
];

function shouldRespondToMessage(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  const trimmed = text.trim();
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}

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
    const cpaArr = row.cost_per_action_type || [];
    const cpa = cpaArr.find((a: any) => a.action_type === "lead")?.value || null;
    return {
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0"),
      clicks: parseInt(row.clicks || "0"),
      ctr: parseFloat(row.ctr || "0"),
      cpc: parseFloat(row.cpc || "0"),
      leads: parseInt(leads),
      cpa: cpa ? parseFloat(cpa) : null,
      reach: parseInt(row.reach || "0"),
    };
  } catch {
    return null;
  }
}

// OpenAI tools for the WhatsApp agent
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "criar_pendencia",
      description: "Cria uma pendência/tarefa para um colaborador responsável em um cliente específico. Use quando Alisson pedir para designar, criar ou adicionar uma pendência, tarefa ou ação para alguém da equipe.",
      parameters: {
        type: "object",
        properties: {
          group_name: { type: "string", description: "Nome do grupo/cliente (parcial ou completo)" },
          term: { type: "string", description: "Descrição da pendência/tarefa" },
          responsible: { type: "string", description: "Nome do responsável (ex: Jader Costa, Murilo Araújo, Netto Monge)" },
          due_date: { type: "string", description: "Data de prazo no formato YYYY-MM-DD (opcional)", nullable: true },
          priority: { type: "string", enum: ["urgente", "normal", "baixa"], description: "Prioridade da pendência" },
        },
        required: ["group_name", "term", "responsible", "priority"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description: "Cria uma tarefa geral (não vinculada necessariamente a um cliente) para um membro da equipe. Use para tarefas do dia a dia, comandos operacionais, ou qualquer ação que não seja uma pendência de cliente específico.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto da tarefa" },
          description: { type: "string", description: "Descrição detalhada (opcional)", nullable: true },
          assigned_to: { type: "string", description: "Nome do responsável (ex: Jader Costa, Murilo Araújo, Netto Monge, Priscilla Borges, Joel, Thais, Daniella, Victor Botto, Jiza Reis)" },
          group_name: { type: "string", description: "Nome do cliente associado (opcional)", nullable: true },
          due_date: { type: "string", description: "Data de prazo no formato YYYY-MM-DD (opcional)", nullable: true },
          priority: { type: "string", enum: ["urgente", "normal", "baixa"], description: "Prioridade da tarefa" },
        },
        required: ["title", "assigned_to", "priority"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "perguntar_detalhes",
      description: "Envia uma pergunta de volta ao Alisson via WhatsApp para obter mais detalhes antes de executar uma ação. Use quando faltarem informações essenciais para completar uma tarefa.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "A pergunta a ser enviada para o Alisson" },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Handle Alisson's AI auto-reply: full agent with dashboard access, tool calling, and follow-up questions
 */
async function handleAlissonAIReply(
  messageText: string,
  groupId: string,
  supabase: any
) {
  try {
    const OPENAI_API_KEY = Deno.env.get("openai");
    if (!OPENAI_API_KEY) {
      console.error("OpenAI key not configured for Alisson AI reply");
      return;
    }
    const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");

    // Fetch all groups
    const { data: grupos } = await supabase.from("whatsapp_grupos").select("*").order("nome");
    if (!grupos?.length) return;

    // Fetch last 50 messages per group for richer context
    const groupIds = grupos.map((g: any) => g.group_id);
    const conversasPromises = groupIds.map((gid: string) =>
      supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, recebido_em, direcao")
        .eq("group_id", gid)
        .order("recebido_em", { ascending: false })
        .limit(50)
    );

    const pendingResPromise = supabase
      .from("pending_demand_resolutions")
      .select("*")
      .eq("resolved", false);

    const [pendingResResult, ...conversasResults] = await Promise.all([
      pendingResPromise,
      ...conversasPromises,
    ]);

    const pendingResolutions = pendingResResult.data || [];
    const groupMsgsMap = new Map<string, any[]>();
    for (let i = 0; i < groupIds.length; i++) {
      groupMsgsMap.set(groupIds[i], conversasResults[i].data || []);
    }

    // Fetch ads data
    const groupsWithAds = grupos.filter((g: any) => g.ad_account_id);
    const adsDataMap = new Map<string, any>();
    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        const adsData = await fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN);
        if (adsData) adsDataMap.set(g.group_id, adsData);
      });
      await Promise.all(adsPromises);
    }

    // Pending by group
    const pendingByGroup = new Map<string, any[]>();
    for (const p of pendingResolutions) {
      if (!pendingByGroup.has(p.group_id)) pendingByGroup.set(p.group_id, []);
      pendingByGroup.get(p.group_id)!.push(p);
    }

    // Build enriched context for each group (matching ai-analyze quality)
    const contextLines: string[] = [];
    let totalMsgs = 0;

    for (const g of grupos) {
      const gid = g.group_id;
      const msgs = groupMsgsMap.get(gid) || [];
      totalMsgs += msgs.length;

      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      let mesesCliente = "";
      if (g.data_entrada) {
        const months = Math.floor((Date.now() - new Date(g.data_entrada).getTime()) / (1000 * 60 * 60 * 24 * 30));
        mesesCliente = `${months} meses como cliente`;
      }

      // Calculate FRT
      const frtSamples: number[] = [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].direcao === "entrada") {
          for (let j = i - 1; j >= 0; j--) {
            if (msgs[j].direcao === "saida") {
              const diff = (new Date(msgs[j].recebido_em).getTime() - new Date(msgs[i].recebido_em).getTime()) / 60000;
              if (diff > 0 && diff < 1440) frtSamples.push(diff);
              break;
            }
          }
        }
      }
      const frtMinutes = frtSamples.length > 0 ? Math.round(frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length) : null;

      // Sentiment
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

      const lastMsg = msgs[0];
      const lastActivity = lastMsg ? new Date(lastMsg.recebido_em) : null;
      const daysInactive = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)) : null;

      const groupPending = pendingByGroup.get(gid) || [];
      const ads = adsDataMap.get(gid);

      let line = `### ${g.nome}`;
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
      line += `\n  Sentimento: ${sentiment === "positivo" ? "🟢 Positivo" : sentiment === "negativo" ? "🔴 Negativo" : "🟡 Neutro"}`;
      if (daysInactive !== null) {
        line += `\n  Última atividade: ${daysInactive === 0 ? "Hoje" : `há ${daysInactive} dia(s)`}`;
      }
      if (groupPending.length > 0) {
        line += `\n  ⚠️ Pendências abertas: ${groupPending.length}`;
        for (const p of groupPending.slice(0, 5)) {
          line += `\n    - "${p.term}" (desde ${p.created_at})${p.due_date ? ` prazo: ${p.due_date}` : ""}`;
        }
      }
      if (ads) {
        line += `\n  📊 META ADS (30d): Gasto R$${ads.spend.toFixed(2)}, ${ads.impressions} impressões, ${ads.clicks} cliques, CTR ${ads.ctr.toFixed(2)}%, CPC R$${ads.cpc.toFixed(2)}, Leads ${ads.leads}${ads.cpa ? `, CPA R$${ads.cpa.toFixed(2)}` : ""}, Alcance ${ads.reach}`;
      } else if (g.ad_account_id) {
        line += `\n  📊 META ADS: Conta vinculada mas sem dados nos últimos 30 dias`;
      }

      // Last 10 messages
      const last10 = msgs.slice(0, 10).reverse();
      if (last10.length > 0) {
        line += `\n  Últimas mensagens:`;
        for (const m of last10) {
          const dir = m.direcao === "entrada" ? "👤 CLIENTE" : "👨‍💼 EQUIPE";
          line += `\n    ${dir} (${m.nome_contato || "?"}, ${m.recebido_em}): ${(m.mensagem || "").slice(0, 120)}`;
        }
      }
      contextLines.push(line);
    }

    // Load Alisson's recent chat history for multi-turn context
    const { data: recentAlissonMsgs } = await supabase
      .from("whatsapp_conversas")
      .select("mensagem, direcao, recebido_em, nome_contato")
      .or(`${ALISSON_PHONE_FILTERS.join(",")},nome_contato.ilike.%alisson%`)
      .order("recebido_em", { ascending: false })
      .limit(20);

    const chatHistory: { role: string; content: string }[] = [];
    if (recentAlissonMsgs?.length) {
      const reversed = [...recentAlissonMsgs].reverse();
      for (const m of reversed) {
        // Skip the current message (it will be added as the latest user message)
        if (m.mensagem === messageText && m.direcao === "entrada") continue;
        chatHistory.push({
          role: m.direcao === "entrada" ? "user" : "assistant",
          content: m.mensagem || "",
        });
      }
    }

    const systemPrompt = `Você é a Vox, analista sênior de Customer Success da agência de marketing digital New Vox. Você está respondendo diretamente ao Alisson (sócio proprietário) via WhatsApp. Você é o agente pessoal dele para gestão da operação.

EQUIPE NEW VOX (conheça cada um para direcionar ações corretamente):
- Jader Costa: Gestor de tráfego
- Murilo Araújo (Murillo): Gestor de tráfego / Gerente
- Netto Monge: Gestor de tráfego
- Priscilla Borges: Social media e sócia da empresa
- Alisson Lima: Sócio proprietário (é quem está falando com você)
- Joel: Gerente geral
- Thais: Auxiliar de social media
- Daniella: Equipe operacional
- Victor Botto: Design gráfico
- Jiza Reis: Financeiro

SUAS CAPACIDADES COMO AGENTE:

1. PAINEL COMPLETO — Você tem acesso a TODOS os dados de TODOS os clientes em tempo real: mensagens, sentimento, FRT, pendências, dados de ads (Meta), responsáveis, planos, investimentos.

2. RESUMO/ANÁLISE — De qualquer grupo individual, comparação entre grupos, panorama geral da operação, diagnóstico de problemas, tendências.

3. CRIAR PENDÊNCIAS — Quando Alisson pedir para designar pendências de CLIENTE, use "criar_pendencia". Sempre confirme os detalhes na resposta.

4. CRIAR TAREFAS — Para tarefas gerais do dia a dia (não necessariamente vinculadas a cliente), use "criar_tarefa". Exemplos: "pede pro Victor fazer um banner", "fala pro Joel organizar reunião". Pode ou não vincular a um cliente.

5. PEDIR DETALHES — Se faltar informação essencial para executar uma ação (ex: qual cliente, qual prazo, qual responsável), use a ferramenta "perguntar_detalhes" para perguntar ao Alisson antes de agir.

5. ANÁLISE DE EQUIPE — Performance individual dos gestores, volume de respostas, FRT por responsável.

6. ANÁLISE DE ADS — Métricas de anúncios Meta por cliente: gasto, leads, CPA, CTR, alcance.

7. ALERTAS E URGÊNCIAS — Pendências abertas, clientes inativos, sentimento piorando, SLA violado.

8. RECOMENDAÇÕES PROATIVAS — Ações prioritárias com QUEM deve fazer, PARA QUAL cliente, e POR QUÊ.

REGRAS:
- Responda DIRETO e CONCISO (máximo 400 palavras) — é WhatsApp
- Use emojis com moderação: 🔴 crítico, 🟡 atenção, 🟢 ok, ⚡ urgente, 📊 dados, 📋 tarefas
- NUNCA invente dados. Se não tem, diga
- Quando sugerir ações, diga QUEM da equipe deve fazer (use nomes)
- Benchmarks: FRT ideal <30min, bom até 60, ruim >120. Churn <30 tranquilo, >60 ação necessária
- Se Alisson falar algo sem contexto claro, tente inferir ou pergunte usando a ferramenta
- Formate para WhatsApp (texto simples, sem markdown complexo, use * para negrito)

DADOS DA OPERAÇÃO EM TEMPO REAL (${grupos.length} grupos, ${totalMsgs} mensagens, ${adsDataMap.size} contas de ads):

${contextLines.join("\n\n")}`;

    // Build messages array with conversation history
    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-10), // Last 10 messages for context
      { role: "user", content: messageText },
    ];

    // Call OpenAI with tool calling
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: aiMessages,
        tools: AGENT_TOOLS,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error for Alisson reply:", response.status, await response.text());
      return;
    }

    const aiData = await response.json();
    const choice = aiData.choices?.[0];
    if (!choice) {
      console.log("No AI choice generated");
      return;
    }

    let aiReply = choice.message?.content || "";
    const toolCalls = choice.message?.tool_calls || [];

    // Process tool calls
    const toolResults: string[] = [];
    for (const tc of toolCalls) {
      const fnName = tc.function?.name;
      const args = JSON.parse(tc.function?.arguments || "{}");
      console.log(`Tool call: ${fnName}`, JSON.stringify(args));

      if (fnName === "criar_pendencia") {
        // Find the group by name match
        const matchedGroup = grupos.find((g: any) =>
          g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
          args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
        );

        if (matchedGroup) {
          const { error: insertErr } = await supabase.from("pending_demand_resolutions").insert({
            group_id: matchedGroup.group_id,
            term: `[${args.responsible}] ${args.term}`,
            requested_at: new Date().toISOString(),
            status: "pendente",
            due_date: args.due_date || null,
          });

          if (insertErr) {
            console.error("Error creating pendência:", insertErr);
            toolResults.push(`❌ Erro ao criar pendência: ${insertErr.message}`);
          } else {
            toolResults.push(`✅ Pendência criada: "${args.term}" para ${args.responsible} no cliente ${matchedGroup.nome}${args.due_date ? ` (prazo: ${args.due_date})` : ""}`);
            console.log("Pendência criada com sucesso para", matchedGroup.nome);
          }
        } else {
          toolResults.push(`❌ Cliente "${args.group_name}" não encontrado. Clientes disponíveis: ${grupos.slice(0, 10).map((g: any) => g.nome).join(", ")}`);
        }
      }

      if (fnName === "criar_tarefa") {
        let matchedGroupId: string | null = null;
        if (args.group_name) {
          const matchedGroup = grupos.find((g: any) =>
            g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
            args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
          );
          matchedGroupId = matchedGroup?.group_id || null;
        }

        const { error: insertErr } = await supabase.from("tasks").insert({
          title: args.title,
          description: args.description || null,
          assigned_to: args.assigned_to,
          group_id: matchedGroupId,
          priority: args.priority || "normal",
          due_date: args.due_date || null,
          created_by: "Alisson Lima (via WhatsApp)",
          status: "pendente",
        });

        if (insertErr) {
          console.error("Error creating task:", insertErr);
          toolResults.push(`❌ Erro ao criar tarefa: ${insertErr.message}`);
        } else {
          toolResults.push(`✅ Tarefa criada: "${args.title}" para ${args.assigned_to}${args.group_name ? ` (cliente: ${args.group_name})` : ""}${args.due_date ? ` prazo: ${args.due_date}` : ""}`);
        }
      }

      if (fnName === "perguntar_detalhes") {
        // The question IS the reply — send it directly
        aiReply = args.question;
        console.log("AI asking follow-up question:", args.question);
      }
    }

    // If there were tool calls and we need a follow-up response with results
    if (toolCalls.length > 0 && toolCalls.some((tc: any) => ["criar_pendencia", "criar_tarefa"].includes(tc.function?.name))) {
      // Call OpenAI again with tool results for a natural confirmation message
      const toolResultMessages = toolCalls.map((tc: any, i: number) => ({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResults[i] || "OK",
      }));

      const followUp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            ...aiMessages,
            choice.message,
            ...toolResultMessages,
          ],
          max_tokens: 500,
        }),
      });

      if (followUp.ok) {
        const followUpData = await followUp.json();
        aiReply = followUpData.choices?.[0]?.message?.content || toolResults.join("\n");
      } else {
        aiReply = toolResults.join("\n");
      }
    }

    if (!aiReply) {
      console.log("No AI reply generated");
      return;
    }

    console.log("AI reply for Alisson:", aiReply.substring(0, 100) + "...");

    // Save AI response as a conversation record for history continuity
    await supabase.from("whatsapp_conversas").insert({
      telefone: "5564992565779",
      nome_contato: "Vox (IA)",
      mensagem: aiReply,
      group_id: groupId,
      direcao: "saida",
      status: "enviada",
      recebido_em: new Date().toISOString(),
    });

    // Send response via n8n webhook
    const webhookResponse = await fetch(ALISSON_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "5564992565779",
        message: aiReply,
        groupId: groupId,
        type: "ai_response",
      }),
    });

    console.log("Webhook response status:", webhookResponse.status);
  } catch (err) {
    console.error("Error in Alisson AI reply:", err);
  }
}

// Nomes do time New Vox — mensagens desses contatos são "saida"
const TEAM_MEMBERS = [
  "jader", "jader costa",
  "alisson", "alisson lima",
  "murilo", "murillo", "murilo araújo", "murilo araujo",
  "priscila", "priscilla", "priscila borges", "priscilla borges",
  "thais", "thaís", "~thais",
  "netto", "netto monge",
  "jiza", "jiza reis",
  "victor", "victor botto",
];

function normalizeName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function detectDirection(fromMe: boolean, contactName: string): string {
  if (fromMe) return "saida";
  const normalized = normalizeName(contactName);
  if (normalized && TEAM_MEMBERS.some((tm) => {
    const normalizedTm = tm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized.includes(normalizedTm);
  })) {
    return "saida";
  }
  return "entrada";
}

function extractPhoneFromJid(jid: string): string | null {
  if (!jid) return null;
  const match = jid.match(/^(\d+)@/);
  return match ? match[1] : null;
}

// Grupos permitidos
const ALLOWED_GROUPS: Record<string, string> = {
  "120363406574401569@g.us": "NV-MKT IMPLANTAR JATAÍ",
  "120363427941134678@g.us": "NV - MICROLINS",
  "120363406346934597@g.us": "NV MKT - EXCLUSIVE",
  "120363387212424738@g.us": "MK-NV Itulub Lançamentos",
  "120363425401904195@g.us": "NV-MKT Instituto Reabilis",
  "120363145568211726@g.us": "MKT NV - ORAL CENTER ARAGUARI",
  "120363419961757740@g.us": "NV - SORRIA BEM",
  "120363422452848401@g.us": "NV-MKT Patos Eixos",
  "120363400497423496@g.us": "MKT-NV Luiz Curti",
  "120363423267143034@g.us": "NV-MKT Beatriz Chaves Confeitaria",
  "120363422455970759@g.us": "NV - SOLUÇÃO T3LED",
  "120363316048469386@g.us": "MKT NV - ORAL CENTER CATALAO",
  "120363419351414313@g.us": "NV-MKT Guardião Proteção",
  "120363405241521628@g.us": "NV - DRA. TACIANE",
  "120363301303362582@g.us": "NV-MKT CIRO AUTO PEÇAS",
  "120363406937225964@g.us": "NV-MKT ORALMED",
  "120363418339795433@g.us": "NV - VEMSER",
  "120363422282387892@g.us": "NV-MKT Trevo Legaliza",
  "120363420218079110@g.us": "NV-MKT MIX IMPORTS",
  "120363404775153601@g.us": "NV - REDEPOP",
  "120363422095140523@g.us": "NV-MKT Chevromix",
  "12036311637739178@g.us": "NV-MKT Veneza",
  "120363164575490995@g.us": "NV-MKT VENEZA SEMI NOVOS",
  "12036342134908487@g.us": "NV - MKT PRIMAVERA M. CONSTRUÇÃO",
  "120363423095337077@g.us": "NV - T3 LED",
  "120363426488293045@g.us": "NV - MKT IMPLANTAR RIO VERDE",
  "120363404804672868@g.us": "NV - MKT ODONTONEO",
  "120363405316956579@g.us": "NV - Guardião e agilidade de tráfego",
  "120363406017903305@g.us": "NV - Bass Importados",
};

function isGroupJid(jid: string): boolean {
  return jid?.endsWith("@g.us") || false;
}

function isAllowedGroup(jid: string): boolean {
  return jid in ALLOWED_GROUPS;
}

async function transcribeAudio(base64Audio: string, mimetype?: string): Promise<string | null> {
  const openaiKey = Deno.env.get("openai");
  if (!openaiKey) return null;

  try {
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const ext = mimetype?.includes("ogg") ? "ogg" : mimetype?.includes("mp4") ? "m4a" : "ogg";
    const blob = new Blob([bytes], { type: mimetype || "audio/ogg" });
    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.text || null;
  } catch {
    return null;
  }
}

async function extractMessageText(message: any, data: any): Promise<string | null> {
  if (!message) return null;
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return `[Imagem] ${message.imageMessage.caption}`;
  if (message.imageMessage) return "[Imagem]";
  if (message.videoMessage?.caption) return `[Vídeo] ${message.videoMessage.caption}`;
  if (message.videoMessage) return "[Vídeo]";
  if (message.audioMessage) {
    const base64 = message.base64 || data?.message?.base64 || message.audioMessage?.base64;
    if (base64) {
      const mimetype = message.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      const transcription = await transcribeAudio(base64, mimetype);
      if (transcription) return `[Áudio Transcrito] ${transcription}`;
    }
    return "[Áudio]";
  }
  if (message.documentMessage?.fileName) return `[Documento] ${message.documentMessage.fileName}`;
  if (message.documentMessage) return "[Documento]";
  if (message.stickerMessage) return "[Figurinha]";
  if (message.contactMessage) return "[Contato]";
  if (message.locationMessage) return "[Localização]";
  if (message.reactionMessage) return null;
  if (message.protocolMessage) return null;
  return null;
}

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
    console.log("Webhook received, event:", body.event, "| has data:", !!body.data);

    // ===== EVOLUTION API FORMAT =====
    if (body.event === "messages.upsert" && body.data) {
      const data = body.data;
      const key = data.key || {};
      const remoteJid = key.remoteJid || "";
      console.log("Processing message, remoteJid:", remoteJid, "| fromMe:", key.fromMe, "| pushName:", data.pushName);

      // Extract phone early to check if it's Alisson
      const isGroup = isGroupJid(remoteJid);
      const earlyPhone = isGroup
        ? (key.participant ? extractPhoneFromJid(key.participant) : null)
        : extractPhoneFromJid(remoteJid);
      const isAlisson = isKnownPhone(earlyPhone, ALISSON_PHONES);
      console.log("isGroup:", isGroup, "| earlyPhone:", earlyPhone, "| isAlisson:", isAlisson, "| isAllowedGroup:", isGroup && isAllowedGroup(remoteJid));

      // Allow Alisson's messages through even from non-whitelisted groups/DMs
      if (!isAlisson && (!isGroup || !isAllowedGroup(remoteJid))) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "group_not_allowed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fromMe = key.fromMe || false;
      const pushName = data.pushName || "";
      const messageTimestamp = data.messageTimestamp;

      let messageText = await extractMessageText(data.message, data);
      if (!messageText && data.messageBody) {
        messageText = data.messageBody;
      }

      if (messageText === null) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "no_text_content" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const groupId = remoteJid;
      const phone = earlyPhone;

      const contactName = pushName || phone || "Desconhecido";
      const direction = detectDirection(fromMe, contactName);

      let receivedAt: string;
      if (messageTimestamp) {
        const ts = typeof messageTimestamp === "number"
          ? messageTimestamp
          : parseInt(messageTimestamp, 10);
        receivedAt = new Date(ts * 1000).toISOString();
      } else {
        receivedAt = new Date().toISOString();
      }

      const isAllowedSource = isGroup && isAllowedGroup(remoteJid);

      // Only insert into DB for whitelisted groups
      if (isAllowedSource) {
        // Auto-create group if not yet registered
        if (groupId) {
          const groupName = ALLOWED_GROUPS[groupId] || data.groupName || remoteJid;
          const { data: existingGroup } = await supabase
            .from("whatsapp_grupos")
            .select("id")
            .eq("group_id", groupId)
            .maybeSingle();

          if (!existingGroup) {
            await supabase.from("whatsapp_grupos").insert({
              group_id: groupId,
              nome: groupName,
            });
            console.log("Auto-created group:", groupId, groupName);
          }
        }

        // Insert conversation record
        const { data: insertedData, error: insertError } = await supabase
          .from("whatsapp_conversas")
          .insert({
            telefone: phone,
            nome_contato: contactName,
            mensagem: messageText,
            group_id: groupId,
            direcao: direction,
            status: "recebida",
            recebido_em: receivedAt,
            dados_extras: body,
          })
          .select();

        if (insertError) {
          console.error("Erro ao inserir:", insertError);
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // ===== ALISSON AI AUTO-REPLY =====
      console.log("Phone:", phone, "| isAlisson:", isAlisson, "| Message:", messageText?.substring(0, 50));
      if (isAlisson && messageText && shouldRespondToMessage(messageText)) {
        console.log("Alisson message detected, triggering AI reply...");
        handleAlissonAIReply(messageText, groupId, supabase).catch((err) =>
          console.error("Alisson AI reply error:", err)
        );
      }

      return new Response(
        JSON.stringify({ success: true, count: 1, source: "evolution_api" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LEGACY N8N FORMAT =====
    const mensagens = Array.isArray(body) ? body : [body];
    const clean = (val: any) =>
      typeof val === "string" && val.startsWith("=") ? val.slice(1) : val;

    function detectDirectionLegacy(msg: any): string {
      const explicit = clean(msg.direcao || msg.direction);
      if (explicit && explicit !== "entrada" && explicit !== "") return explicit;
      const rawName = clean(msg.nome_contato || msg.name || msg.pushName) || "";
      const name = normalizeName(rawName);
      if (name && TEAM_MEMBERS.some((tm) => {
        const normalizedTm = tm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return name.includes(normalizedTm);
      })) {
        return "saida";
      }
      return "entrada";
    }

    const registros = mensagens.map((msg: any) => ({
      telefone: clean(msg.telefone || msg.phone || msg.from) || null,
      nome_contato: clean(msg.nome_contato || msg.name || msg.pushName) || null,
      mensagem: clean(msg.mensagem || msg.message || msg.text || msg.body) || null,
      group_id: clean(msg.group_id) || null,
      direcao: detectDirectionLegacy(msg),
      status: clean(msg.status) || "recebida",
      dados_extras: msg,
    }));

    const { data: legacyData, error: legacyError } = await supabase
      .from("whatsapp_conversas")
      .insert(registros)
      .select();

    if (legacyError) {
      console.error("Erro ao inserir (legacy):", legacyError);
      return new Response(JSON.stringify({ error: legacyError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: legacyData?.length || 0, source: "legacy" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro no webhook:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
