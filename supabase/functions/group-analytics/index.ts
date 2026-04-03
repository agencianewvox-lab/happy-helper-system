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

const COMPLAINT_KEYWORDS = [
  "problema", "reclamação", "reclamacao", "demora",
  "falta de", "cobrando", "cobra",
];

const POSITIVE_KEYWORDS = [
  "👍", "perfeito", "excelente", "ótimo", "otimo",
  "top", "parabéns", "parabens", "maravilhoso", "maravilhosa", "show",
  "muito bom", "adorei", "incrível", "incrivel", "sensacional", "ficou ótimo",
  "aprovado", "aprovada", "gostei", "amei", "mandou bem", "arrasou",
  "satisfeito", "satisfeita",
];

const DEMAND_KEYWORDS = [
  "cadê", "cade", "esperando", "aguardando", "cobrando",
  "quanto tempo", "demora", "atrasado", "atraso",
];

const TEAM_MEMBERS = [
  "jader", "murillo", "murilo", "priscilla", "priscila", "alisson", "joel", "thais", "daniella", "victor botto", "netto", "netto monge", "jiza",
];

const URGENCY_KEYWORDS = [
  "urgente", "emergência", "emergencia", "agora", "imediato", "parou", "caiu", "fora do ar",
];

// ─── Pre-filter patterns (never pendências) ───
const GREETING_PATTERNS = ["bom dia", "boa tarde", "boa noite", "oi", "olá", "ola", "e aí", "e ai"];
const CONFIRMATION_PATTERNS = ["ok", "certo", "beleza", "combinado", "pode ser", "tá bom", "ta bom", "tá", "ta", "sim", "não", "nao", "blz", "vlw", "valeu", "top", "show", "perfeito"];
const THANKS_PATTERNS = ["obrigado", "obrigada", "brigadão", "brigadao", "brigada", "valeu", "thanks"];
const APPROVAL_PATTERNS = ["aprovado", "aprovada", "pode postar", "manda", "solta", "gostei", "amei", "lindo", "linda"];

interface PendingDemandDetail {
  term: string;
  requested_at: string;
  message_excerpt: string;
  suggested_solution: string;
  priority: "urgente" | "normal" | "baixa";
  hours_waiting: number;
  confidence: "alta" | "media";
  category: "confirmada" | "possivel";
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
  priority: "urgente" | "normal" | "baixa";
  timestamp: string;
  suggested_action: string;
  hours_waiting: number;
  confidence: "alta" | "media";
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

// ─── LAYER 1: Pre-filter messages locally ───
function isTeamMember(name: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  return TEAM_MEMBERS.some(t => lower.includes(t));
}

function isNoiseMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Pure emoji (no letters/digits)
  const withoutEmoji = trimmed.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\uFE0F]/gu, "").trim();
  if (!withoutEmoji) return true;

  // Stickers / audio markers
  const lower = trimmed.toLowerCase();
  if (/^\[?(sticker|figurinha|áudio|audio)\]?$/i.test(lower)) return true;

  // Link-only (no additional text from sender)
  if (/^https?:\/\/\S+$/i.test(trimmed)) return true;

  // Short messages (< 3 words) matching noise patterns
  const words = trimmed.split(/\s+/);
  if (words.length < 4) {
    const allPatterns = [...GREETING_PATTERNS, ...CONFIRMATION_PATTERNS, ...THANKS_PATTERNS, ...APPROVAL_PATTERNS];
    if (allPatterns.some(p => lower === p || lower.startsWith(p + " ") || lower.includes(p))) return true;
  }

  return false;
}

function hasUrgency(text: string): boolean {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.some(kw => lower.includes(kw));
}

interface CandidateMessage {
  mensagem: string;
  nome_contato: string;
  created_at: string;
  group_id: string;
  context: any[]; // 5 before + 5 after for AI context
  hours_waiting: number;
  is_urgent: boolean;
}

function preFilterMessages(
  groupId: string,
  msgs: any[],
): CandidateMessage[] {
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const THIRTY_MIN = 30 * 60 * 1000;

  // Step 1: Only messages from last 7 days
  const recentMsgs = msgs.filter(m => (now - new Date(m.created_at).getTime()) <= SEVEN_DAYS);
  if (recentMsgs.length === 0) return [];

  const candidates: CandidateMessage[] = [];

  for (let i = 0; i < recentMsgs.length; i++) {
    const m = recentMsgs[i];
    // Only client messages
    if (m.direcao !== "entrada") continue;

    const text = m.mensagem || "";

    // Step 2: Filter noise
    if (isNoiseMessage(text)) continue;

    // Step 3: Check if team responded AFTER this message
    const msgTime = new Date(m.created_at).getTime();
    let teamResponded = false;
    for (let j = i + 1; j < recentMsgs.length; j++) {
      if (recentMsgs[j].direcao === "saida") {
        teamResponded = true;
        break;
      }
    }
    if (teamResponded) continue;

    // Step 4: Minimum waiting window
    const elapsedMs = now - msgTime;
    const urgent = hasUrgency(text);
    const minWait = urgent ? THIRTY_MIN : TWO_HOURS;
    if (elapsedMs < minWait) continue;

    // Build context (5 before, 5 after)
    const contextStart = Math.max(0, i - 5);
    const contextEnd = Math.min(recentMsgs.length, i + 6);
    const context = recentMsgs.slice(contextStart, contextEnd);

    candidates.push({
      mensagem: text,
      nome_contato: m.nome_contato || "Desconhecido",
      created_at: m.created_at,
      group_id: groupId,
      context,
      hours_waiting: Math.round(elapsedMs / (60 * 60 * 1000) * 10) / 10,
      is_urgent: urgent,
    });
  }

  return candidates;
}

// ─── LAYER 2: AI Analysis ───
const NEW_PENDING_PROMPT = `Você é uma analista de atendimento da agência de marketing New Vox. Sua tarefa é analisar mensagens candidatas a pendência e classificá-las com alta precisão.

EQUIPE NEW VOX (mensagens dessas pessoas são da EQUIPE e NUNCA são pendências):
- Jader: Gestor de tráfego
- Murillo/Murilo: Gestor de tráfego
- Priscilla/Priscila: Social media e sócia
- Alisson: Sócio
- Joel: Gerente geral
- Thais: Auxiliar de social media
- Daniella: Equipe
- Victor Botto: Equipe
- Netto Monge: Gestor de tráfego
- Jiza: Equipe

CATEGORIAS DE CLASSIFICAÇÃO:

1. "PENDÊNCIA CONFIRMADA" (confidence: alta) — O cliente fez solicitação concreta ou pergunta direta que exige ação, e ninguém da equipe respondeu. Ex: pede arte, relatório, ajuste em campanha, reporta problema, pede reunião, envia briefing, cobra algo prometido.

2. "POSSÍVEL PENDÊNCIA" (confidence: media) — Mensagem ambígua que pode ou não ser solicitação. Ex: "seria bom mudar essa foto", pergunta retórica, feedback que pode esperar ação.

3. "NÃO É PENDÊNCIA" — Equipe respondeu implicitamente, assunto já tratado, cliente apenas compartilhando info sem esperar ação, conversa social.

4. "RESOLVIDA" — Havia solicitação mas mensagens posteriores mostram que equipe já tratou.

PRIORIDADE:
- "urgente": afeta campanha ativa, cliente irritado, ou esperando há +8h em horário comercial
- "normal": solicitações regulares
- "baixa": dúvidas informativas

REGRA DE OURO: Na dúvida, NÃO marque como pendência. É melhor perder uma pendência real do que gerar falso positivo.

Use a função report_pending_demands para retornar APENAS as pendências confirmadas e possíveis. Se não encontrar nenhuma, chame com array vazio.`;

function buildCandidateContext(candidates: CandidateMessage[]): string {
  const byGroup = new Map<string, CandidateMessage[]>();
  for (const c of candidates) {
    if (!byGroup.has(c.group_id)) byGroup.set(c.group_id, []);
    byGroup.get(c.group_id)!.push(c);
  }

  const parts: string[] = [];
  for (const [groupId, cands] of byGroup) {
    const lines: string[] = [`--- GRUPO: ${groupId} ---`];
    for (const c of cands) {
      lines.push(`\n[CANDIDATA] ${c.nome_contato} em ${c.created_at} (esperando ${c.hours_waiting}h${c.is_urgent ? " - URGENTE" : ""}):`);
      lines.push(`"${c.mensagem.slice(0, 200)}"`);
      lines.push(`Contexto da conversa:`);
      for (const ctx of c.context) {
        const dir = ctx.direcao === "entrada" ? "CLIENTE" : "EQUIPE";
        const name = ctx.nome_contato || "Desconhecido";
        lines.push(`  [${ctx.created_at}] ${dir} (${name}): ${(ctx.mensagem || "").slice(0, 150)}`);
      }
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

async function detectPendingWithAI(
  allCandidates: CandidateMessage[],
  apiKey: string
): Promise<AIPendingItem[]> {
  if (allCandidates.length === 0) return [];

  const BATCH_SIZE = 15;
  const allItems: AIPendingItem[] = [];

  for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
    const batch = allCandidates.slice(i, i + BATCH_SIZE);
    const conversationText = buildCandidateContext(batch);

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
            { role: "system", content: NEW_PENDING_PROMPT },
            {
              role: "user",
              content: `Analise as mensagens candidatas abaixo. Classifique cada uma e retorne APENAS as que são "PENDÊNCIA CONFIRMADA" ou "POSSÍVEL PENDÊNCIA":\n\n${conversationText}`,
            },
          ],
          temperature: 0.1,
          tools: [
            {
              type: "function",
              function: {
                name: "report_pending_demands",
                description: "Report pending demands found. Call with empty array if none found.",
                parameters: {
                  type: "object",
                  properties: {
                    pendencias: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          group_id: { type: "string", description: "Group ID from conversation header" },
                          client_name: { type: "string", description: "Client name" },
                          message: { type: "string", description: "Original message (max 150 chars)" },
                          type: { type: "string", enum: ["Demanda", "Pergunta sem resposta"] },
                          priority: { type: "string", enum: ["urgente", "normal", "baixa"] },
                          timestamp: { type: "string", description: "ISO timestamp" },
                          suggested_action: { type: "string", description: "Suggested action (max 100 chars)" },
                          hours_waiting: { type: "number", description: "Hours client has been waiting" },
                          confidence: { type: "string", enum: ["alta", "media"], description: "alta = confirmed, media = possible" },
                        },
                        required: ["group_id", "client_name", "message", "type", "priority", "timestamp", "suggested_action", "hours_waiting", "confidence"],
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
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (Array.isArray(parsed.pendencias)) {
            allItems.push(...parsed.pendencias);
          }
        } catch (parseErr) {
          console.error("Failed to parse tool call args:", (toolCall.function.arguments || "").slice(0, 200));
        }
      }
    } catch (fetchErr) {
      console.error("AI fetch error:", fetchErr);
    }
  }

  return allItems;
}

// ─── LAYER 3: Post-AI Validation ───
function postValidate(
  items: AIPendingItem[],
  resolvedSet: Set<string>,
  existingPendingKeys: Set<string>,
): PendingDemandDetail[] {
  const seen = new Map<string, PendingDemandDetail>();

  for (const item of items) {
    const term = item.type === "Demanda" ? "demanda" : "pergunta sem resposta";
    const excerpt = (item.message || "").slice(0, 150);

    // Dedup: same group + similar term in last 24h
    const dedupKey = `${item.group_id}|${term}`;
    if (seen.has(dedupKey)) continue;

    // Check resolved
    const resolvedKey = `${item.group_id}|${term}|${item.timestamp}`;
    if (resolvedSet.has(resolvedKey)) continue;

    // Check existing pending keys (broader match)
    let alreadyResolved = false;
    for (const rk of resolvedSet) {
      if (rk.startsWith(`${item.group_id}|`)) {
        // Similar term check
        const parts = rk.split("|");
        if (parts[1] === term) {
          alreadyResolved = true;
          break;
        }
      }
    }
    if (alreadyResolved) continue;

    const detail: PendingDemandDetail = {
      term,
      requested_at: item.timestamp,
      message_excerpt: excerpt,
      suggested_solution: item.suggested_action || "Equipe dar retorno ao cliente",
      priority: item.priority || "normal",
      hours_waiting: item.hours_waiting || 0,
      confidence: item.confidence || "alta",
      category: item.confidence === "media" ? "possivel" : "confirmada",
    };

    seen.set(dedupKey, detail);
  }

  return Array.from(seen.values());
}

// ─── Intent Detection (unchanged) ───
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

    // Fetch all conversations (paginated)
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

    // Fetch resolved demands
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

    // Step 2: LAYER 1 — Pre-filter candidates across all groups
    const allCandidates: CandidateMessage[] = [];
    for (const [groupId, msgs] of groupedConvs) {
      const candidates = preFilterMessages(groupId, msgs);
      allCandidates.push(...candidates);
    }

    console.log(`Pre-filter: ${allCandidates.length} candidates from ${groupedConvs.size} groups`);

    // Step 3: AI detection + intent detection (parallel)
    let aiPendingItems: AIPendingItem[] = [];
    let intentMap = new Map<string, IntentCategory>();

    const [pendingResult, intentResult] = await Promise.allSettled([
      detectPendingWithAI(allCandidates, LOVABLE_API_KEY),
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

    // Step 4: LAYER 3 — Post-AI validation
    const existingPendingKeys = new Set<string>();
    const validatedByGroup = new Map<string, PendingDemandDetail[]>();

    // Group AI items by group_id for post-validation
    const itemsByGroup = new Map<string, AIPendingItem[]>();
    for (const item of aiPendingItems) {
      if (!itemsByGroup.has(item.group_id)) itemsByGroup.set(item.group_id, []);
      itemsByGroup.get(item.group_id)!.push(item);
    }

    for (const [groupId, items] of itemsByGroup) {
      const validated = postValidate(items, resolvedSet, existingPendingKeys);
      if (validated.length > 0) {
        validatedByGroup.set(groupId, validated.slice(0, 5));
      }
    }

    // Merge into final analytics
    const analytics: Record<string, GroupAnalytics> = {};
    for (const [groupId, partial] of analyticsPartial) {
      const pendingDetails = validatedByGroup.get(groupId) || [];
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
