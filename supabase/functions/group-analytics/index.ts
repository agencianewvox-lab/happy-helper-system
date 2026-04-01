import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Client dissatisfaction keywords - signals unhappiness with results/partnership
const DISSATISFACTION_KEYWORDS = [
  "não chegou lead", "nao chegou lead", "sem lead", "zero lead", "nenhum lead",
  "não estou vendo resultado", "nao estou vendo resultado", "sem resultado",
  "não tá funcionando", "nao ta funcionando", "não está funcionando", "nao esta funcionando",
  "não funciona", "nao funciona", "não deu resultado", "nao deu resultado",
  "resultado ruim", "resultado péssimo", "resultado pessimo", "sem retorno",
  "isso não pode acontecer", "isso nao pode acontecer", "inaceitável", "inaceitavel",
  "não pode continuar assim", "nao pode continuar assim",
  "vou cancelar", "quero cancelar", "cancelar contrato", "rescindir",
  "trocar de agência", "trocar de agencia", "outra agência", "outra agencia",
  "insatisfeito", "insatisfeita", "insatisfação", "insatisfacao",
  "decepcionado", "decepcionada", "decepção", "decepcao",
  "péssimo", "pessimo", "horrível", "horrivel", "absurdo",
  "descaso", "falta de compromisso", "falta de comprometimento",
  "estou pagando", "pago caro", "jogando dinheiro fora",
  "não recomendo", "nao recomendo", "arrependido", "arrependida",
  "pior", "piorou", "caiu", "despencou",
  "não vale a pena", "nao vale a pena", "perda de tempo",
  "vocês não entregam", "voces nao entregam", "não entrega", "nao entrega",
  "prometeram", "prometeu", "foi prometido",
  "cadê os resultados", "cade os resultados",
  "ninguém resolve", "ninguem resolve", "não resolveu", "nao resolveu",
  "sempre a mesma coisa", "de novo isso", "de novo",
  "nunca funciona", "nunca dá certo", "nunca da certo",
];

// General negative sentiment keywords (lighter weight)
const COMPLAINT_KEYWORDS = [
  "problema", "reclamação", "reclamacao", "demora",
  "falta de", "cobrando", "cobra",
];

// Positive engagement keywords
const POSITIVE_KEYWORDS = [
  "👍", "perfeito", "excelente", "ótimo", "otimo",
  "top", "parabéns", "parabens", "maravilhoso", "maravilhosa", "show",
  "muito bom", "adorei", "incrível", "incrivel", "sensacional", "ficou ótimo",
  "aprovado", "aprovada", "gostei", "amei", "mandou bem", "arrasou",
  "satisfeito", "satisfeita",
];

// Demand keywords for churn scoring only
const DEMAND_KEYWORDS = [
  "cadê", "cade", "esperando", "aguardando", "cobrando",
  "quanto tempo", "demora", "atrasado", "atraso",
];

// Team member names - messages from these people are NOT client messages
const TEAM_MEMBERS = [
  "jader", "murillo", "priscilla", "alisson", "joel", "thais", "daniella", "victor botto",
];

interface PendingDemandDetail {
  term: string;
  requested_at: string;
  message_excerpt: string;
  suggested_solution: string;
}

interface ChurnBreakdown {
  base: number;
  dissatisfaction: number;
  complaints: number;
  demands: number;
  positive: number;
  frt: number;
  no_response: number;
  inactivity: number;
}

type IntentCategory = "Aprovação" | "Suporte Técnico" | "Financeiro" | "Urgência" | "Informativo" | null;

interface GroupAnalytics {
  group_id: string;
  avg_frt_minutes: number | null;
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number;
  complaint_count: number;
  complaint_terms: string[];
  positive_count: number;
  demand_count: number;
  engagement_type: "saudável" | "cobrança" | "misto" | "inativo";
  churn_risk: number;
  churn_breakdown: ChurnBreakdown;
  total_client_msgs: number;
  total_team_msgs: number;
  has_pending_demands: boolean;
  pending_demand_terms: string[];
  pending_demand_details: PendingDemandDetail[];
  intent: IntentCategory;
}

interface AIPendingItem {
  group_id: string;
  client_name: string;
  message: string;
  type: "Demanda" | "Pergunta sem resposta";
  timestamp: string;
  suggested_action: string;
}

function countKeywordMatches(text: string, keywords: string[]): { count: number; matched: string[] } {
  const lower = text.toLowerCase();
  let count = 0;
  const matched: string[] = [];
  for (const kw of keywords) {
    const regex = new RegExp(kw.toLowerCase(), "gi");
    const matches = lower.match(regex);
    if (matches) {
      count += matches.length;
      if (!matched.includes(kw)) matched.push(kw);
    }
  }
  return { count, matched };
}

const PENDING_DETECTION_PROMPT = `Você é uma IA responsável por analisar conversas em grupos de atendimento de clientes.

Seu objetivo é identificar pendências reais que precisam de ação da equipe.

Uma pendência ocorre quando um cliente solicita algo ou faz uma pergunta e a equipe não respondeu ou não assumiu a execução da tarefa.

Você deve analisar a sequência da conversa, não apenas mensagens isoladas.

EQUIPE NEW VOX (mensagens desses nomes são da equipe, NÃO são pendências de clientes):
- Jader: Gestor de tráfego
- Murillo: Gestor de tráfego
- Priscilla: Social media e sócia da empresa
- Alisson: Sócio da empresa
- Joel: Gerente geral
- Thais: Auxiliar de social media
- Daniella: Equipe
- Victor Botto: Equipe

DEFINIÇÃO DE PENDÊNCIA:
Uma mensagem deve ser marcada como PENDÊNCIA quando:
1. A mensagem foi enviada pelo CLIENTE (não pela equipe)
2. O cliente fez uma pergunta ou solicitou algo
3. Nenhum membro da equipe respondeu a essa mensagem
4. Nenhum membro da equipe confirmou que vai executar a solicitação
Se qualquer membro da equipe respondeu ou assumiu a tarefa, NÃO existe mais pendência.

TIPOS DE PENDÊNCIA:
1. "Demanda" — Quando o cliente pede algo para ser executado (arte, campanha, alteração, vídeo, etc.)
2. "Pergunta sem resposta" — Quando o cliente faz uma pergunta e ninguém respondeu

REGRAS DE CANCELAMENTO DE PENDÊNCIA:
Se qualquer membro da equipe responder algo como "Já vou fazer", "Pode deixar", "Já estou cuidando", "Vou verificar", "Vou subir agora", "Já solicitamos isso" — então a pendência DEIXA de existir.

O QUE NÃO É PENDÊNCIA (NUNCA marcar como pendência):
- Agradecimentos: "Obrigado", "Valeu", "Perfeito", "Show", "Beleza", "Top"
- Emojis: 👍 🔥 👏 🙏 ❤️
- Confirmações simples: "Ok", "Certo", "Combinado", "Pode deixar"
- Conversa informal: "Bom dia", "Boa tarde", "Boa noite", "Tudo bem?"

REGRA DE PRECISÃO:
A análise deve conter APENAS problemas reais que precisam de ação da equipe. Evite falsos alertas.

Use a função report_pending_demands para retornar as pendências encontradas. Se não houver pendências, chame com array vazio.`;

function buildConversationContext(groupId: string, msgs: any[]): string {
  // Take last 30 messages for context
  const recentMsgs = msgs.slice(-30);
  const lines = recentMsgs.map((m: any) => {
    const dir = m.direcao === "entrada" ? "CLIENTE" : "EQUIPE";
    const name = m.nome_contato || "Desconhecido";
    const time = m.created_at;
    const text = (m.mensagem || "").slice(0, 200);
    return `[${time}] ${dir} (${name}): ${text}`;
  });
  return `\n--- GRUPO: ${groupId} ---\n${lines.join("\n")}`;
}

async function detectPendingWithAI(
  groupConversations: Map<string, any[]>,
  apiKey: string
): Promise<AIPendingItem[]> {
  if (groupConversations.size === 0) return [];

  // Build conversation context for all groups
  const contextParts: string[] = [];
  for (const [groupId, msgs] of groupConversations) {
    if (msgs.length === 0) continue;
    contextParts.push(buildConversationContext(groupId, msgs));
  }

  if (contextParts.length === 0) return [];

  // Batch groups to avoid token limits (~10 groups per call)
  const BATCH_SIZE = 10;
  const allItems: AIPendingItem[] = [];
  
  for (let i = 0; i < contextParts.length; i += BATCH_SIZE) {
    const batch = contextParts.slice(i, i + BATCH_SIZE);
    const conversationText = batch.join("\n\n");

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: PENDING_DETECTION_PROMPT },
            {
              role: "user",
              content: `Analise as conversas abaixo e identifique TODAS as pendências reais:\n\n${conversationText}`,
            },
          ],
          temperature: 0.1,
          tools: [
            {
              type: "function",
              function: {
                name: "report_pending_demands",
                description: "Report all pending demands found in the conversations. Call with empty array if no pending demands found.",
                parameters: {
                  type: "object",
                  properties: {
                    pendencias: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          group_id: { type: "string", description: "The group ID from the conversation header" },
                          client_name: { type: "string", description: "Name of the client who sent the message" },
                          message: { type: "string", description: "Original message text (max 120 chars)" },
                          type: { type: "string", enum: ["Demanda", "Pergunta sem resposta"] },
                          timestamp: { type: "string", description: "ISO timestamp of the message" },
                          suggested_action: { type: "string", description: "Suggested action for the team" },
                        },
                        required: ["group_id", "client_name", "message", "type", "timestamp", "suggested_action"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["pendencias"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_pending_demands" } },
        }),
      });

      if (!response.ok) {
        console.error("AI pending detection error:", response.status, await response.text());
        continue;
      }

      const data = await response.json();
      
      // Extract from tool call response
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (Array.isArray(parsed.pendencias)) {
            allItems.push(...parsed.pendencias);
          }
        } catch (parseErr) {
          console.error("Failed to parse tool call args:", toolCall.function.arguments.slice(0, 200));
        }
      } else {
        // Fallback: try content as JSON
        let content = data.choices?.[0]?.message?.content || "[]";
        content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        try {
          const items = JSON.parse(content);
          if (Array.isArray(items)) allItems.push(...items);
        } catch { /* ignore */ }
      }
    } catch (fetchErr) {
      console.error("AI fetch error:", fetchErr);
    }
  }

  return allItems;
}

const INTENT_DETECTION_PROMPT = `Você é uma IA que classifica a intenção principal das últimas mensagens de clientes em grupos de WhatsApp de uma agência de marketing digital.

Classifique cada grupo em UMA das categorias:
- "Aprovação" — Cliente aguardando ou enviando aprovação de arte, campanha, post, vídeo
- "Suporte Técnico" — Problemas técnicos, bugs, site fora do ar, erro em anúncio
- "Financeiro" — Assuntos sobre pagamento, boleto, contrato, investimento, valores
- "Urgência" — Situação urgente que precisa de ação imediata (reclamação grave, prazo apertado)
- "Informativo" — Conversa geral, alinhamento, bom dia, atualizações sem ação pendente

Analise apenas as ÚLTIMAS 5-10 mensagens do CLIENTE (não da equipe) para determinar a intenção.
Use a função classify_intents para retornar os resultados.`;

async function detectIntentWithAI(
  groupConversations: Map<string, any[]>,
  apiKey: string
): Promise<Map<string, IntentCategory>> {
  const result = new Map<string, IntentCategory>();
  if (groupConversations.size === 0) return result;

  const contextParts: { groupId: string; text: string }[] = [];
  for (const [groupId, msgs] of groupConversations) {
    // Get last 10 client messages
    const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada").slice(-10);
    if (clientMsgs.length === 0) continue;
    const text = clientMsgs.map((m: any) => (m.mensagem || "").slice(0, 150)).join("\n");
    contextParts.push({ groupId, text: `[GRUPO: ${groupId}]\n${text}` });
  }

  const BATCH_SIZE = 15;
  for (let i = 0; i < contextParts.length; i += BATCH_SIZE) {
    const batch = contextParts.slice(i, i + BATCH_SIZE);
    const conversationText = batch.map(b => b.text).join("\n\n");

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: INTENT_DETECTION_PROMPT },
            { role: "user", content: `Classifique a intenção de cada grupo:\n\n${conversationText}` },
          ],
          temperature: 0.1,
          tools: [{
            type: "function",
            function: {
              name: "classify_intents",
              description: "Classify the intent of each group's recent messages",
              parameters: {
                type: "object",
                properties: {
                  intents: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        group_id: { type: "string" },
                        intent: { type: "string", enum: ["Aprovação", "Suporte Técnico", "Financeiro", "Urgência", "Informativo"] },
                      },
                      required: ["group_id", "intent"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["intents"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "classify_intents" } },
        }),
      });

      if (!response.ok) {
        console.error("AI intent error:", response.status, await response.text());
        continue;
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (Array.isArray(parsed.intents)) {
            for (const item of parsed.intents) {
              const validIntents = ["Aprovação", "Suporte Técnico", "Financeiro", "Urgência", "Informativo"];
              if (validIntents.includes(item.intent)) {
                result.set(item.group_id, item.intent as IntentCategory);
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      console.error("AI intent fetch error:", err);
    }
  }

  return result;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all conversations (paginated to avoid 1000 limit)
    let allConversas: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, created_at, direcao")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allConversas = allConversas.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // Fetch resolved pending demands to filter them out
    const { data: resolvedDemands, error: resolvedError } = await supabase
      .from("pending_demand_resolutions")
      .select("group_id, term, requested_at")
      .eq("resolved", true);
    if (resolvedError) throw resolvedError;

    const resolvedSet = new Set<string>();
    for (const r of (resolvedDemands || [])) {
      resolvedSet.add(`${r.group_id}|${r.term}|${r.requested_at}`);
    }

    // Group conversations by group_id
    const groupedConvs = new Map<string, any[]>();
    for (const c of allConversas) {
      if (!c.group_id) continue;
      if (!groupedConvs.has(c.group_id)) groupedConvs.set(c.group_id, []);
      groupedConvs.get(c.group_id)!.push(c);
    }

    // Step 1: Compute FRT, sentiment, churn for all groups
    const analyticsPartial: Map<string, Omit<GroupAnalytics, "has_pending_demands" | "pending_demand_terms" | "pending_demand_details">> = new Map();

    for (const [groupId, msgs] of groupedConvs) {
      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      // FRT calculation (business hours)
      const BRT_OFFSET = -3;
      const BIZ_START = 8;
      const BIZ_END = 18;
      const BIZ_MINUTES_PER_DAY = (BIZ_END - BIZ_START) * 60;

      function toBrt(d: Date): Date {
        return new Date(d.getTime() + BRT_OFFSET * 60 * 60 * 1000);
      }

      function businessMinutesBetween(start: Date, end: Date): number {
        const s = toBrt(start);
        const e = toBrt(end);
        if (e <= s) return 0;

        let total = 0;

        const clampToBiz = (d: Date): Date => {
          const h = d.getHours() + d.getMinutes() / 60;
          if (h < BIZ_START) { d.setHours(BIZ_START, 0, 0, 0); }
          else if (h >= BIZ_END) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          return d;
        };

        const cStart = clampToBiz(new Date(s));
        const cEnd = new Date(e);

        if (cStart >= cEnd) return 0;

        const sameDay = cStart.toDateString() === cEnd.toDateString();
        if (sameDay) {
          const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
          const startH = cStart.getHours() + cStart.getMinutes() / 60;
          return Math.max(0, Math.round((endH - startH) * 60));
        }

        total += (BIZ_END - (cStart.getHours() + cStart.getMinutes() / 60)) * 60;

        const nextDay = new Date(cStart);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(BIZ_START, 0, 0, 0);
        while (nextDay.toDateString() !== cEnd.toDateString()) {
          if (nextDay.getDay() !== 0 && nextDay.getDay() !== 6) {
            total += BIZ_MINUTES_PER_DAY;
          }
          nextDay.setDate(nextDay.getDate() + 1);
          if (total > 30 * BIZ_MINUTES_PER_DAY) break;
        }

        if (cEnd.getDay() !== 0 && cEnd.getDay() !== 6) {
          const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
          if (endH > BIZ_START) {
            total += (endH - BIZ_START) * 60;
          }
        }

        return Math.max(0, Math.round(total));
      }

      let totalFrt = 0;
      let frtCount = 0;
      let waitingForResponse = false;
      let clientMsgTime: Date | null = null;

      for (const msg of msgs) {
        if (msg.direcao === "entrada" && !waitingForResponse) {
          waitingForResponse = true;
          clientMsgTime = new Date(msg.created_at);
        } else if (msg.direcao === "saida" && waitingForResponse && clientMsgTime) {
          const responseTime = new Date(msg.created_at);
          const bizMinutes = businessMinutesBetween(clientMsgTime, responseTime);
          if (bizMinutes > 0 && bizMinutes < 30 * BIZ_MINUTES_PER_DAY) {
            totalFrt += bizMinutes;
            frtCount++;
          }
          waitingForResponse = false;
          clientMsgTime = null;
        }
      }

      const avgFrt = frtCount > 0 ? Math.round(totalFrt / frtCount) : null;

      // Sentiment and complaint analysis
      const allClientText = clientMsgs.map((m: any) => m.mensagem || "").join(" ");
      const { count: dissatisfactionCount, matched: dissatisfactionTerms } = countKeywordMatches(allClientText, DISSATISFACTION_KEYWORDS);
      const { count: complaintCount } = countKeywordMatches(allClientText, COMPLAINT_KEYWORDS);
      const { count: positiveCount } = countKeywordMatches(allClientText, POSITIVE_KEYWORDS);
      const { count: demandCount } = countKeywordMatches(allClientText, DEMAND_KEYWORDS);

      const totalSignals = positiveCount + complaintCount + dissatisfactionCount + demandCount || 1;
      const sentimentScore = Math.round(((positiveCount - dissatisfactionCount * 2 - complaintCount - demandCount * 0.5) / totalSignals) * 100);
      const sentiment: "positivo" | "neutro" | "negativo" =
        sentimentScore > 20 ? "positivo" : sentimentScore < -20 ? "negativo" : "neutro";

      let engagementType: "saudável" | "cobrança" | "misto" | "inativo";
      if (clientMsgs.length === 0) {
        engagementType = "inativo";
      } else if (positiveCount > complaintCount + demandCount) {
        engagementType = "saudável";
      } else if (complaintCount + demandCount > positiveCount * 2) {
        engagementType = "cobrança";
      } else {
        engagementType = "misto";
      }

      const breakdown: ChurnBreakdown = {
        base: 30,
        dissatisfaction: Math.min(dissatisfactionCount * 12, 50),
        complaints: Math.min(complaintCount * 3, 10),
        demands: Math.min(demandCount * 2, 8),
        positive: -Math.min(positiveCount * 4, 25),
        frt: 0,
        no_response: 0,
        inactivity: 0,
      };

      if (avgFrt !== null) {
        if (avgFrt > 480) breakdown.frt = 10;
        else if (avgFrt > 120) breakdown.frt = 5;
        else if (avgFrt < 30) breakdown.frt = -5;
      }
      if (teamMsgs.length === 0 && clientMsgs.length > 0) breakdown.no_response = 15;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        const daysSince = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 14) breakdown.inactivity = 10;
        else if (daysSince > 7) breakdown.inactivity = 5;
      }

      let churnRisk = breakdown.base + breakdown.dissatisfaction + breakdown.complaints + breakdown.demands + breakdown.positive + breakdown.frt + breakdown.no_response + breakdown.inactivity;
      churnRisk = Math.max(0, Math.min(100, churnRisk));

      analyticsPartial.set(groupId, {
        group_id: groupId,
        avg_frt_minutes: avgFrt,
        sentiment,
        sentiment_score: sentimentScore,
        complaint_count: complaintCount,
        complaint_terms: dissatisfactionTerms.slice(0, 5),
        positive_count: positiveCount,
        demand_count: demandCount,
        engagement_type: engagementType,
        churn_risk: Math.round(churnRisk),
        churn_breakdown: breakdown,
        total_client_msgs: clientMsgs.length,
        total_team_msgs: teamMsgs.length,
      });
    }

    // Step 2: AI-powered pending demand detection + intent detection (parallel)
    let aiPendingItems: AIPendingItem[] = [];
    let intentMap = new Map<string, IntentCategory>();
    
    const [pendingResult, intentResult] = await Promise.allSettled([
      detectPendingWithAI(groupedConvs, LOVABLE_API_KEY),
      detectIntentWithAI(groupedConvs, LOVABLE_API_KEY),
    ]);
    
    if (pendingResult.status === "fulfilled") {
      aiPendingItems = pendingResult.value;
    } else {
      console.error("AI pending detection failed:", pendingResult.reason);
    }
    
    if (intentResult.status === "fulfilled") {
      intentMap = intentResult.value;
    } else {
      console.error("AI intent detection failed:", intentResult.reason);
    }

    // Step 3: Map AI results to groups and build final analytics
    const pendingByGroup = new Map<string, PendingDemandDetail[]>();
    for (const item of aiPendingItems) {
      if (!pendingByGroup.has(item.group_id)) pendingByGroup.set(item.group_id, []);
      
      const detail: PendingDemandDetail = {
        term: item.type === "Demanda" ? "demanda" : "pergunta sem resposta",
        requested_at: item.timestamp,
        message_excerpt: (item.message || "").slice(0, 120),
        suggested_solution: item.suggested_action || "Equipe dar retorno ao cliente",
      };

      // Filter out resolved
      const key = `${item.group_id}|${detail.term}|${detail.requested_at}`;
      if (!resolvedSet.has(key)) {
        pendingByGroup.get(item.group_id)!.push(detail);
      }
    }

    // Merge into final analytics
    const analytics: Record<string, GroupAnalytics> = {};
    for (const [groupId, partial] of analyticsPartial) {
      const pendingDetails = (pendingByGroup.get(groupId) || []).slice(0, 5);
      const pendingTerms = pendingDetails.map(d => d.term);

      analytics[groupId] = {
        ...partial,
        has_pending_demands: pendingDetails.length > 0,
        pending_demand_terms: pendingTerms,
        pending_demand_details: pendingDetails,
        intent: intentMap.get(groupId) || null,
      };
    }

    return new Response(JSON.stringify({ analytics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
