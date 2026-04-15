import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── SENTIMENT KEYWORD TIERS ───

const CRITICAL_TERMS = [
  "cancelar contrato", "rescindir", "não renovar", "nao renovar",
  "trocar de agência", "trocar de agencia", "outra agência", "outra agencia",
  "buscar outra empresa", "acionar advogado", "processar", "procon", "reclame aqui",
  "vou cancelar", "quero cancelar",
];

const HIGH_TERMS = [
  "insatisfeito", "insatisfeita", "insatisfação", "insatisfacao",
  "decepcionado", "decepcionada", "decepção", "decepcao",
  "péssimo", "pessimo", "horrível", "horrivel", "absurdo", "descaso",
  "inaceitável", "inaceitavel", "jogando dinheiro fora", "não vale a pena", "nao vale a pena",
  "nunca funciona", "nunca dá certo", "nunca da certo",
  "não entregam o que prometem", "nao entregam o que prometem",
  "cadê os resultados", "cade os resultados", "ninguém resolve", "ninguem resolve",
  "sempre a mesma coisa",
  "não chegou lead", "nao chegou lead", "sem lead", "zero lead", "nenhum lead",
  "sem resultado", "sem retorno", "resultado ruim", "resultado péssimo", "resultado pessimo",
  "não estou vendo resultado", "nao estou vendo resultado",
  "não tá funcionando", "nao ta funcionando", "não está funcionando", "nao esta funcionando",
  "não funciona", "nao funciona", "não deu resultado", "nao deu resultado",
  "piorou", "caiu", "despencou",
  "pago caro", "estou pagando",
];

const MEDIUM_TERMS = [
  "problema", "demora", "atraso", "erro",
  "não está funcionando", "nao esta funcionando", "quebrou", "parou",
  "cansado", "chateado", "irritado", "estressado",
  "cadê", "cade", "esperando", "aguardando", "quando fica pronto", "previsão", "previsao",
];

const POSITIVE_TERMS = [
  "excelente", "incrível", "incrivel", "sensacional", "maravilhoso", "maravilhosa",
  "espetacular", "arrasou", "mandou bem", "nota 10", "melhor agência", "melhor agencia",
  "perfeito", "ótimo", "otimo", "muito bom", "adorei", "amei", "gostei",
  "top", "show", "parabéns", "parabens", "ficou lindo", "ficou perfeito",
  "aprovado", "aprovada", "satisfeito", "satisfeita", "feliz", "contente", "recomendo",
  "👍", "❤️", "🔥", "👏", "💪", "🙏", "😍", "⭐",
];

const COMPLAINT_KEYWORDS = [
  "problema", "reclamação", "reclamacao", "demora",
  "falta de", "cobrando", "cobra",
];

const DEMAND_KEYWORDS = [
  "cadê", "cade", "esperando", "aguardando", "cobrando",
  "quanto tempo", "demora", "atrasado", "atraso",
];

// Keywords that indicate a client REQUEST (even polite ones)
const REQUEST_KEYWORDS = [
  "poderia", "pode me", "pode enviar", "pode mandar", "pode reenviar",
  "reenviar", "reenvie", "reenvia", "me enviar", "me mandar",
  "preciso", "precisava", "gostaria", "necessito",
  "tem como", "teria como", "seria possível", "seria possivel",
  "por favor", "por gentileza", "solicito", "solicitar",
  "caso tenha", "se possível", "se possivel",
  "me passar", "me informar", "me envie", "me mande",
  "quando vai", "quando será", "quando sera", "quando posso",
  "ainda não recebi", "ainda nao recebi", "não recebi", "nao recebi",
  "não chegou", "nao chegou",
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
const REPORT_PATTERNS = [
  "relatorio diario", "relatório diário", "relatorio semanal", "relatório semanal",
  "segue o nosso relatório", "segue o relatorio", "captação", "captacao",
  "leads novos", "sem retorno", "sem interesse", "agendamentos do dia",
  "conversas iniciadas", "custo por conversa", "valor investido", "investimento:",
  "impressoes:", "impressões:", "alcance:", "periodo:", "período:"
];
const TERMINAL_ACK_PATTERNS = [
  /^(?:ok(?:ay)?|certo|fechado|combinado|perfeito|show|top|valeu|obrigad[oa]|blz|beleza|resolvido|joia|jóia|massa|dahora|demais|sensacional|maravilh[oa]|excelente|incrivel|arrasou|mandou bem|muito bom|bom demais|👍+|👍🏻+|👍🏽+|👍🏿+|🙏+|❤️+|ok obrigado|ok obrigada|show obrigado|show obrigada)[!.\s]*$/i,
  /^(?:👍|👍🏻|👍🏽|👍🏿|👏|🙏|❤️|✅|🔥|ok){1,4}$/i,
  /^(?:top|show|perfeito|massa|sensacional|excelente|maravilh[oa]|incrivel|arrasou|muito bom|bom)\s+(?:demais|dms|bom demais|bom dms|de\s*bola|de\s*mais|hein|viu|d\+)[!.\s]*$/i,
  /^top\s+bom\s+(?:demais|dms|d\+)[!.\s]*$/i,
  /^(?:ficou|ta|tá|está)\s+(?:top|show|perfeito|lindo|massa|demais|sensacional|excelente|maravilhos[oa]|incrivel|otimo|ótimo|bom demais)[!.\s]*$/i,
  /^(?:amei|adorei|curti|gostei|aprovado|aprovei|manda ver|pode ser|isso ai|isso aí|boa|boaa+|ótimo|otimo|muito bom|bom demais|top demais)[!.\s]*$/i,
];
const SELF_RESOLVED_PATTERNS = [
  /^(?:ok[,.!\s]+)?vou\s+(?:fazer|pagar|realizar|resolver)\s+(?:isso\s+)?aqui[!.\s]*$/i,
  /^(?:ok[,.!\s]+)?vou\s+ver(?:ificar)?\s+aqui[!.\s]*$/i,
  /^(?:ja|já)\s+estou\s+aqui[!.\s]*$/i,
  /^(?:deixa|deixa que eu)\s+(?:comigo|eu\s+(?:vejo|verifico|resolvo)\s+aqui)[!.\s]*$/i,
];
// SCHEDULE_PROMISE_PATTERNS: Only match when team EXPLICITLY promises to schedule 
// something with the client — must contain a clear commitment verb + scheduling context together.
// Single words like "agendar" or "call" alone are NOT enough.
const SCHEDULE_PROMISE_PATTERNS = [
  /vou\s+(?:te\s+)?(?:agendar|marcar)\s+(?:uma?\s+)?(?:call|reuni[aã]o|conversa)/i,
  /vamos\s+(?:agendar|marcar)\s+(?:uma?\s+)?(?:call|reuni[aã]o|conversa)/i,
  /(?:te\s+)?(?:aciono|chamo)\s+(?:para|pra)\s+(?:uma?\s+)?(?:call|reuni[aã]o|conversa)/i,
  /logo\s+(?:te\s+)?aciono/i,
  /te\s+chamo\s+(?:para|pra)/i,
  /podemos\s+nos\s+falar/i,
  /vamos\s+nos\s+falar/i,
  /(?:vou|vamos)\s+marcar\s+(?:um\s+)?hor[aá]rio/i,
];
const SCHEDULE_FOLLOW_THROUGH_PATTERNS = [
  /agendad[oa]/i,
  /segue.*link/i,
  /enviando.*link/i,
  /link da reuni[aã]o/i,
  /meet\.google\.com/i,
  /hor[aá]rio confirmado/i,
  /marquei/i,
  /chamei/i,
  /liguei/i,
  /falei com voc[eê]/i,
];

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

interface ChurnDriver {
  label: string;
  points: number;
}

type SentimentTrend = "melhorando" | "piorando" | "estavel";
type IntentCategory = "Aprovação" | "Suporte Técnico" | "Financeiro" | "Urgência" | "Informativo" | null;
type PriorityLevel = "maxima" | "alta" | "normal" | null;

interface GroupAnalytics {
  group_id: string;
  avg_frt_minutes: number | null;
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number;
  sentiment_trend: SentimentTrend;
  critical_terms: string[];
  complaint_count: number;
  complaint_terms: string[];
  positive_count: number;
  demand_count: number;
  engagement_type: "saudável" | "cobrança" | "misto" | "inativo";
  churn_risk: number;
  churn_risk_label: "baixo" | "moderado" | "alto" | "crítico";
  churn_drivers: ChurnDriver[];
  total_client_msgs: number;
  total_team_msgs: number;
  has_pending_demands: boolean;
  pending_demand_terms: string[];
  pending_demand_details: PendingDemandDetail[];
  intent: IntentCategory;
  priority_level: PriorityLevel;
  priority_reason: string | null;
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

// ─── SENTIMENT COMPUTATION (4 dimensions) ───

function computeSentiment(clientMsgs: any[]): {
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number;
  sentiment_trend: SentimentTrend;
  critical_terms: string[];
  positive_count: number;
  complaint_count: number;
  complaint_terms: string[];
  demand_count: number;
} {
  const now = Date.now();
  const H24 = 24 * 60 * 60 * 1000;
  const D3 = 3 * 24 * 60 * 60 * 1000;
  const D7 = 7 * 24 * 60 * 60 * 1000;

  function timeMultiplier(msgTime: number): number {
    const age = now - msgTime;
    if (age <= H24) return 3;
    if (age <= D3) return 2;
    if (age <= D7) return 1.5;
    return 1;
  }

  function matchTerms(text: string, terms: string[]): string[] {
    const lower = text.toLowerCase();
    return terms.filter(t => lower.includes(t.toLowerCase()));
  }

  let negativeScore = 0;
  let positiveScore = 0;
  const allCritical: string[] = [];
  const allComplaintTerms: string[] = [];
  let complaintCount = 0;
  let positiveCount = 0;
  let demandCount = 0;

  // For trend: split into recent (last 3 days) vs previous (3-6 days)
  let recentNeg = 0, recentPos = 0;
  let prevNeg = 0, prevPos = 0;

  for (const m of clientMsgs) {
    const text = (m.mensagem || "").toLowerCase();
    if (!text.trim()) continue;
    const msgTime = new Date(m.created_at).getTime();
    const mult = timeMultiplier(msgTime);
    const isRecent = (now - msgTime) <= D3;
    const isPrev = (now - msgTime) > D3 && (now - msgTime) <= (D3 * 2);

    // Critical (weight 5)
    const critMatches = matchTerms(text, CRITICAL_TERMS);
    for (const t of critMatches) {
      negativeScore += 5 * mult;
      if (!allCritical.includes(t)) allCritical.push(t);
      if (isRecent) recentNeg += 5 * mult;
      if (isPrev) prevNeg += 5 * mult;
    }

    // High (weight 3)
    const highMatches = matchTerms(text, HIGH_TERMS);
    for (const t of highMatches) {
      negativeScore += 3 * mult;
      if (!allComplaintTerms.includes(t)) allComplaintTerms.push(t);
      complaintCount++;
      if (isRecent) recentNeg += 3 * mult;
      if (isPrev) prevNeg += 3 * mult;
    }

    // Medium (weight 1.5)
    const medMatches = matchTerms(text, MEDIUM_TERMS);
    for (const _t of medMatches) {
      negativeScore += 1.5 * mult;
      complaintCount++;
      if (isRecent) recentNeg += 1.5 * mult;
      if (isPrev) prevNeg += 1.5 * mult;
    }

    // Positive (weight -2)
    const posMatches = matchTerms(text, POSITIVE_TERMS);
    for (const _t of posMatches) {
      positiveScore += 2 * mult;
      positiveCount++;
      if (isRecent) recentPos += 2 * mult;
      if (isPrev) prevPos += 2 * mult;
    }

    // Demand count
    const demMatches = matchTerms(text, DEMAND_KEYWORDS);
    demandCount += demMatches.length;
  }

  // Dimension 3: Score final
  const rawScore = negativeScore - positiveScore;
  let sentimentScoreNorm: number;
  if (rawScore > 0) {
    sentimentScoreNorm = -Math.min(rawScore / 30, 1);
  } else if (rawScore < 0) {
    sentimentScoreNorm = Math.min(Math.abs(rawScore) / 20, 1);
  } else {
    sentimentScoreNorm = 0;
  }

  const sentiment: "positivo" | "neutro" | "negativo" =
    sentimentScoreNorm > 0.2 ? "positivo" : sentimentScoreNorm < -0.2 ? "negativo" : "neutro";

  // Dimension 4: Trend
  const recentSent = recentPos > 0 || recentNeg > 0 ? (recentPos - recentNeg) / Math.max(recentPos + recentNeg, 1) : 0;
  const prevSent = prevPos > 0 || prevNeg > 0 ? (prevPos - prevNeg) / Math.max(prevPos + prevNeg, 1) : 0;
  const diff = recentSent - prevSent;
  let sentiment_trend: SentimentTrend = "estavel";
  if (diff > 0.15) sentiment_trend = "melhorando";
  else if (diff < -0.15) sentiment_trend = "piorando";

  return {
    sentiment,
    sentiment_score: Math.round(sentimentScoreNorm * 100),
    sentiment_trend,
    critical_terms: allCritical.slice(0, 5),
    positive_count: positiveCount,
    complaint_count: complaintCount,
    complaint_terms: allComplaintTerms.slice(0, 5),
    demand_count: demandCount,
  };
}

// ─── CHURN RISK (6 indicators) ───

function computeChurnRisk(
  sentimentResult: ReturnType<typeof computeSentiment>,
  avgFrt: number | null,
  pendingDetails: PendingDemandDetail[],
  lastMsgTime: number | null,
  _investimento_ads: number | null,
  _adScore: number | null,
): { churn_risk: number; churn_risk_label: "baixo" | "moderado" | "alto" | "crítico"; churn_drivers: ChurnDriver[] } {
  const drivers: ChurnDriver[] = [];
  const now = Date.now();

  // Indicator 1: Sentiment
  let sentPoints = 0;
  if (sentimentResult.sentiment === "negativo" && sentimentResult.critical_terms.length > 0) {
    sentPoints = 30;
    drivers.push({ label: "Sentimento negativo com termos críticos", points: 30 });
  } else if (sentimentResult.sentiment === "negativo") {
    sentPoints = 20;
    drivers.push({ label: "Sentimento negativo", points: 20 });
  } else if (sentimentResult.sentiment === "neutro") {
    sentPoints = 5;
    drivers.push({ label: "Sentimento neutro", points: 5 });
  }
  if (sentimentResult.sentiment_trend === "piorando") {
    sentPoints += 10;
    drivers.push({ label: "Tendência de sentimento piorando", points: 10 });
  }

  // Indicator 2: Pending demands (max 30)
  let pendPoints = 0;
  for (const d of pendingDetails) {
    if (d.priority === "urgente") pendPoints += 10;
    else if (d.priority === "normal") pendPoints += 5;
    else pendPoints += 2;
  }
  pendPoints = Math.min(pendPoints, 30);
  if (pendPoints > 0) {
    drivers.push({ label: "Pendências abertas", points: pendPoints });
  }

  // Indicator 3: Response time
  let frtPoints = 0;
  if (avgFrt !== null) {
    if (avgFrt > 240) { frtPoints = 15; drivers.push({ label: "FRT médio acima de 4h", points: 15 }); }
    else if (avgFrt > 120) { frtPoints = 8; drivers.push({ label: "FRT médio entre 2-4h", points: 8 }); }
    else if (avgFrt > 60) { frtPoints = 3; drivers.push({ label: "FRT médio entre 1-2h", points: 3 }); }
  }

  // Indicator 4: Inactivity
  let inactPoints = 0;
  if (lastMsgTime) {
    const daysSince = (now - lastMsgTime) / (1000 * 60 * 60 * 24);
    if (daysSince > 5) { inactPoints = 15; drivers.push({ label: "Inativo há mais de 5 dias", points: 15 }); }
    else if (daysSince > 3) { inactPoints = 8; drivers.push({ label: "Inativo há 3-5 dias", points: 8 }); }
    else if (daysSince > 1) { inactPoints = 3; drivers.push({ label: "Inativo há 1-3 dias", points: 3 }); }
  }

  // Indicator 5: Complaint pattern (simplified: based on complaint count)
  let compPoints = 0;
  if (sentimentResult.complaint_count > 5) { compPoints = 10; drivers.push({ label: "Alto volume de reclamações", points: 10 }); }
  else if (sentimentResult.complaint_count > 2) { compPoints = 3; drivers.push({ label: "Reclamações moderadas", points: 3 }); }

  // Indicator 6: Ad performance
  let adPoints = 5; // neutral default
  if (_adScore !== null) {
    if (_adScore < 40) { adPoints = 10; drivers.push({ label: "Score de anúncios abaixo de 40", points: 10 }); }
    else if (_adScore < 60) { adPoints = 5; drivers.push({ label: "Score de anúncios moderado", points: 5 }); }
    else { adPoints = 0; }
  }

  const total = Math.max(0, Math.min(100, sentPoints + pendPoints + frtPoints + inactPoints + compPoints + adPoints));
  const label: "baixo" | "moderado" | "alto" | "crítico" =
    total >= 80 ? "crítico" : total >= 60 ? "alto" : total >= 30 ? "moderado" : "baixo";

  // Sort drivers by points desc
  drivers.sort((a, b) => b.points - a.points);

  return { churn_risk: total, churn_risk_label: label, churn_drivers: drivers };
}

// ─── PRIORITY MÁXIMA ───

function computePriority(
  sentimentResult: ReturnType<typeof computeSentiment>,
  churnRisk: number,
  pendingDetails: PendingDemandDetail[],
  avgFrt: number | null,
  lastMsgTime: number | null,
  investimento_ads: number | null,
  _adScore: number | null,
): { priority_level: PriorityLevel; priority_reason: string | null } {
  const now = Date.now();
  const urgentPending = pendingDetails.filter(d => d.priority === "urgente");

  // Combo 1: negative + critical_terms + urgent pending
  if (sentimentResult.sentiment === "negativo" && sentimentResult.critical_terms.length > 0 && urgentPending.length > 0) {
    return { priority_level: "maxima", priority_reason: `Sentimento negativo com menção a "${sentimentResult.critical_terms[0]}" + ${urgentPending.length} pendência(s) urgente(s) aberta(s)` };
  }

  // Combo 2: churn > 80 + trend piorando
  if (churnRisk > 80 && sentimentResult.sentiment_trend === "piorando") {
    return { priority_level: "maxima", priority_reason: `Risco de churn crítico (${churnRisk}%) e sentimento piorando` };
  }

  // Combo 3: inactive > 5 days + last sentiment negative
  if (lastMsgTime) {
    const daysSince = (now - lastMsgTime) / (1000 * 60 * 60 * 24);
    if (daysSince > 5 && sentimentResult.sentiment === "negativo") {
      return { priority_level: "maxima", priority_reason: `Inativo há ${Math.round(daysSince)} dias com último sentimento negativo` };
    }
  }

  // Combo 4: > 3 pending + FRT > 4h + negative/neutral
  if (pendingDetails.length > 3 && avgFrt !== null && avgFrt > 240 && sentimentResult.sentiment !== "positivo") {
    return { priority_level: "maxima", priority_reason: `${pendingDetails.length} pendências abertas + FRT médio de ${Math.round(avgFrt / 60)}h + sentimento ${sentimentResult.sentiment}` };
  }

  // Combo 5: invest > 3000 + adScore < 40 + negative
  if (investimento_ads && investimento_ads > 3000 && _adScore !== null && _adScore < 40 && sentimentResult.sentiment === "negativo") {
    return { priority_level: "maxima", priority_reason: `Investimento alto (R$${investimento_ads}) + performance ruim + insatisfação` };
  }

  if (churnRisk >= 60) return { priority_level: "alta", priority_reason: null };
  return { priority_level: "normal", priority_reason: null };
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
function isNoiseMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const withoutEmoji = trimmed.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\uFE0F]/gu, "").trim();
  if (!withoutEmoji) return true;
  const lower = trimmed.toLowerCase();
  if (/^\[?(sticker|figurinha|áudio|audio)\]?$/i.test(lower)) return true;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length < 4) {
    const allPatterns = [...GREETING_PATTERNS, ...CONFIRMATION_PATTERNS, ...THANKS_PATTERNS, ...APPROVAL_PATTERNS];
    if (allPatterns.some(p => lower === p || lower.startsWith(p + " ") || lower.includes(p))) return true;
  }
  return false;
}

function normalizeText(text: string): string {
  return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function stripTrailingSignature(text: string): string {
  return text.replace(/[!.\s]+[a-z]{1,2}$/i, "").trim();
}

function getEffectiveTime(msg: any): string {
  return msg.recebido_em && msg.recebido_em > msg.created_at ? msg.recebido_em : msg.created_at;
}

function isInformationalReport(text: string): boolean {
  const normalized = normalizeText(text);
  const matches = REPORT_PATTERNS.filter((pattern) => normalized.includes(pattern)).length;
  return matches >= 2 || (normalized.includes("relatorio") && normalized.includes("lead"));
}

function isTerminalAcknowledgement(text: string): boolean {
  const normalized = normalizeText(text);
  const sanitized = stripTrailingSignature(normalized);
  return TERMINAL_ACK_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(sanitized))
    || SELF_RESOLVED_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(sanitized));
}

function businessMinutesBetween(startIso: string, endIso: string, businessStart = 8, businessEnd = 18.5): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end <= start) return 0;
  const toBrt = (date: Date) => new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const startBrt = toBrt(start);
  const endBrt = toBrt(end);
  const setBusinessStart = (date: Date) => date.setHours(Math.floor(businessStart), businessStart % 1 ? 30 : 0, 0, 0);
  const setBusinessEnd = (date: Date) => date.setHours(Math.floor(businessEnd), businessEnd % 1 ? 30 : 0, 0, 0);
  const clamp = (date: Date) => {
    const clone = new Date(date);
    while (clone.getDay() === 0 || clone.getDay() === 6) {
      clone.setDate(clone.getDate() + 1);
      setBusinessStart(clone);
    }
    const hour = clone.getHours() + clone.getMinutes() / 60;
    if (hour < businessStart) setBusinessStart(clone);
    else if (hour >= businessEnd) {
      clone.setDate(clone.getDate() + 1);
      setBusinessStart(clone);
      while (clone.getDay() === 0 || clone.getDay() === 6) clone.setDate(clone.getDate() + 1);
    }
    return clone;
  };
  const cursor = clamp(startBrt);
  if (cursor >= endBrt) return 0;
  let total = 0;
  while (cursor < endBrt) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      const dayEnd = new Date(cursor);
      setBusinessEnd(dayEnd);
      const sliceEnd = endBrt < dayEnd ? endBrt : dayEnd;
      if (sliceEnd > cursor) total += (sliceEnd.getTime() - cursor.getTime()) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
    setBusinessStart(cursor);
    while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(0, Math.round(total));
}

function hasUrgency(text: string): boolean {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.some(kw => lower.includes(kw));
}

function hasRequestOrQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("?")) return true;
  return REQUEST_KEYWORDS.some(kw => lower.includes(kw));
}

interface CandidateMessage {
  mensagem: string;
  nome_contato: string;
  created_at: string;
  group_id: string;
  context: any[];
  hours_waiting: number;
  is_urgent: boolean;
}

function preFilterMessages(groupId: string, msgs: any[]): CandidateMessage[] {
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_MIN = 30 * 60 * 1000;
  const TEN_MIN = 10 * 60 * 1000;
  const recentMsgs = msgs.filter(m => (now - new Date(getEffectiveTime(m)).getTime()) <= SEVEN_DAYS);
  if (recentMsgs.length === 0) return [];
  const candidates: CandidateMessage[] = [];
  for (let i = 0; i < recentMsgs.length; i++) {
    const m = recentMsgs[i];
    if (m.direcao !== "entrada") continue;
    const text = m.mensagem || "";
    if (isNoiseMessage(text) || isInformationalReport(text) || isTerminalAcknowledgement(text)) continue;
    const msgTime = new Date(getEffectiveTime(m)).getTime();
    let teamResponded = false;
    for (let j = i + 1; j < recentMsgs.length; j++) {
        if (recentMsgs[j].direcao === "saida") { teamResponded = true; break; }
    }
    if (teamResponded) continue;
    const elapsedMs = now - msgTime;
    const urgent = hasUrgency(text);
    const isRequest = hasRequestOrQuestion(text);
    // Urgent: 10min, Request/Question: 30min, Other: 30min (all reduced for faster detection)
    const minWait = urgent ? TEN_MIN : THIRTY_MIN;
    if (elapsedMs < minWait) continue;
    const contextStart = Math.max(0, i - 5);
    const contextEnd = Math.min(recentMsgs.length, i + 6);
    const context = recentMsgs.slice(contextStart, contextEnd);
    candidates.push({
      mensagem: text,
      nome_contato: m.nome_contato || "Desconhecido",
      created_at: getEffectiveTime(m),
      group_id: groupId,
      context,
      hours_waiting: Math.round(elapsedMs / (60 * 60 * 1000) * 10) / 10,
      is_urgent: urgent,
    });
  }
  return candidates;
}

function detectUnfulfilledTeamPromises(groupId: string, msgs: any[]): AIPendingItem[] {
  const ordered = [...msgs].sort((a, b) => getEffectiveTime(a).localeCompare(getEffectiveTime(b)));
  const items: AIPendingItem[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const msg = ordered[i];
    const text = msg.mensagem || "";
    if (msg.direcao !== "saida" || isInformationalReport(text)) continue;
    if (!SCHEDULE_PROMISE_PATTERNS.some((pattern) => pattern.test(text))) continue;

    const subsequent = ordered.slice(i + 1);
    const fulfilled = subsequent.some((next) => {
      const nextText = next.mensagem || "";
      if (next.direcao === "saida" && SCHEDULE_FOLLOW_THROUGH_PATTERNS.some((pattern) => pattern.test(nextText))) return true;
      if (next.direcao === "entrada" && /entrando|estou aqui|ja estou aqui|já estou aqui|entrei|no meet/i.test(normalizeText(nextText))) return true;
      return false;
    });
    if (fulfilled) continue;

    // If the LAST message in the conversation is a terminal ack (ok, perfeito, etc.) from the client,
    // it means the conversation was concluded — NOT a pending demand
    const lastMsg = ordered[ordered.length - 1];
    if (lastMsg && lastMsg.direcao === "entrada" && isTerminalAcknowledgement(lastMsg.mensagem || "")) continue;
    // Also skip if the last message is from the team (no client waiting)
    if (lastMsg && lastMsg.direcao === "saida" && ordered.slice(i + 1).filter(m => m.direcao === "entrada" && !isTerminalAcknowledgement(m.mensagem || "")).length === 0) continue;

    const relevantClientReply = [...subsequent]
      .filter((next) => next.direcao === "entrada" && !isInformationalReport(next.mensagem || "") && !isTerminalAcknowledgement(next.mensagem || ""))
      .pop();

    // Only flag if there's actually a client waiting for something
    if (!relevantClientReply) continue;

    const waitingMinutes = businessMinutesBetween(getEffectiveTime(msg), new Date().toISOString());
    if (waitingMinutes < 60) continue; // Increased from 30 to 60 min

    const clientName = relevantClientReply.nome_contato || "cliente";
    items.push({
      group_id: groupId,
      client_name: clientName,
      message: relevantClientReply.mensagem || text,
      type: "Demanda",
      priority: waitingMinutes >= 240 ? "urgente" : "normal",
      timestamp: getEffectiveTime(relevantClientReply),
      suggested_action: `Agendar a call combinada e confirmar horário com ${clientName}`,
      hours_waiting: Math.round((waitingMinutes / 60) * 10) / 10,
      confidence: "media",
    });
    break;
  }
  return items;
}

// ─── LAYER 2: AI Analysis ───
const NEW_PENDING_PROMPT = `Você é uma analista de atendimento da agência de marketing New Vox. Sua tarefa é analisar mensagens candidatas a pendência e classificá-las com PRECISÃO. Evite falsos positivos — só marque como pendência quando o cliente CLARAMENTE espera uma ação ou resposta da equipe.

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

REGRAS CRÍTICAS PARA ANÁLISE CONTEXTUAL:
- Leia TODA a sequência de mensagens para entender o CONTEXTO da conversa
- Se a conversa terminou com o cliente dizendo "ok", "top", "perfeito", "vou fazer", "beleza", etc → NÃO é pendência
- Se o cliente está apenas informando algo (ex: "vou fazer aqui", "vou pagar", "vou enviar") → NÃO é pendência  
- Se a equipe mencionou "agendar" ou "call" casualmente, sem compromisso direto → NÃO é pendência
- Se a equipe enviou relatório e o cliente apenas reagiu → NÃO é pendência
- Conversas retóricas onde ninguém precisa agir → NÃO é pendência

CATEGORIAS DE CLASSIFICAÇÃO:

1. "PENDÊNCIA CONFIRMADA" (confidence: alta) — O cliente fez uma solicitação CLARA e EXPLÍCITA que exige ação da equipe, e ninguém respondeu:
   - Pedidos diretos ("me envie o relatório", "preciso do acesso", "pode reenviar?")
   - Perguntas que exigem resposta ("quando fica pronto?", "já foi feito?")
   - Cobranças explícitas ("ainda não recebi", "cadê o material?")

2. "POSSÍVEL PENDÊNCIA" (confidence: media) — Mensagem que PROVAVELMENTE requer ação mas o contexto é ambíguo.

3. "NÃO É PENDÊNCIA" — Quando: equipe já respondeu, assunto encerrado, cliente informando algo, conversas retóricas, ou cliente apenas reagindo/confirmando.

4. "RESOLVIDA" — Havia solicitação mas já foi tratada.

NÃO marque como pendência:
- Encerramento/ack do cliente (ex: "ok", "perfeito", "👍", "vou fazer", "top bom demais")
- Relatórios informativos da equipe
- Conversas onde o cliente está apenas confirmando ou informando algo
- Menções casuais da equipe a "call", "agendar", "reunião" sem compromisso direto com o cliente

PRIORIDADE:
- "urgente": afeta campanha ativa, cliente irritado, esperando há +4h em horário comercial, ou solicitação sem resposta há +2h
- "normal": solicitações regulares
- "baixa": dúvidas puramente informativas

REGRA DE OURO: Na dúvida, analise o CONTEXTO COMPLETO da conversa. Só marque como pendência quando for CLARO que o cliente espera uma ação.

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

// ─── LOCAL FALLBACK: detect pendencies without AI ───
function detectPendingLocally(allCandidates: CandidateMessage[]): AIPendingItem[] {
  const items: AIPendingItem[] = [];
  for (const c of allCandidates) {
    const text = c.mensagem.toLowerCase();
    if (isInformationalReport(text) || isTerminalAcknowledgement(text)) continue;
    const hasQuestion = text.includes("?");
    const hasRequest = REQUEST_KEYWORDS.some(kw => text.includes(kw));
    const hasDemand = DEMAND_KEYWORDS.some(kw => text.includes(kw));
    const isUrgent = c.is_urgent || c.hours_waiting >= 2;

    if (hasQuestion || hasRequest || hasDemand) {
      const type = hasDemand ? "Demanda" : "Pergunta sem resposta";
      const priority = isUrgent ? "urgente" : c.hours_waiting >= 1 ? "normal" : "baixa";
      const confidence = (hasQuestion && c.hours_waiting >= 0.5) || hasDemand ? "alta" : "media";
      items.push({
        group_id: c.group_id,
        client_name: c.nome_contato,
        message: c.mensagem.slice(0, 200),
        type,
        priority,
        timestamp: c.created_at,
        suggested_action: `Responder ${c.nome_contato} — esperando há ${c.hours_waiting}h`,
        hours_waiting: c.hours_waiting,
        confidence,
      });
    }
  }
  return items;
}

async function detectPendingWithAI(allCandidates: CandidateMessage[], apiKey: string): Promise<AIPendingItem[]> {
  if (allCandidates.length === 0) return [];
  const BATCH_SIZE = 15;
  const allItems: AIPendingItem[] = [];
  let aiFailed = false;
  for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
    const batch = allCandidates.slice(i, i + BATCH_SIZE);
    const conversationText = buildCandidateContext(batch);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: NEW_PENDING_PROMPT },
            { role: "user", content: `Analise as mensagens candidatas abaixo:\n\n${conversationText}` },
          ],
          temperature: 0.1,
          tools: [{
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
                        group_id: { type: "string" },
                        client_name: { type: "string" },
                        message: { type: "string" },
                        type: { type: "string", enum: ["Demanda", "Pergunta sem resposta"] },
                        priority: { type: "string", enum: ["urgente", "normal", "baixa"] },
                        timestamp: { type: "string" },
                        suggested_action: { type: "string" },
                        hours_waiting: { type: "number" },
                        confidence: { type: "string", enum: ["alta", "media"] },
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
          }],
          tool_choice: { type: "function", function: { name: "report_pending_demands" } },
        }),
      });
      if (!response.ok) {
        console.error("AI pending error:", response.status, "- falling back to local detection");
        aiFailed = true;
        break;
      }
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (Array.isArray(parsed.pendencias)) allItems.push(...parsed.pendencias);
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error("AI fetch error:", err, "- falling back to local detection");
      aiFailed = true;
      break;
    }
  }
  // Fallback: if AI failed, use local keyword-based detection
  if (aiFailed && allItems.length === 0) {
    console.info("Using LOCAL fallback for pending detection");
    return detectPendingLocally(allCandidates);
  }
  return allItems;
}

// ─── LAYER 3: Post-AI Validation ───
function postValidate(items: AIPendingItem[], resolvedSet: Set<string>): PendingDemandDetail[] {
  const seen = new Map<string, PendingDemandDetail>();
  for (const item of items) {
        const normalizedAction = (item.suggested_action || "").toLowerCase();
        const term = normalizedAction.includes("agendar a call") || normalizedAction.includes("confirmar horário") || normalizedAction.includes("confirmar horario")
          ? "agendar call"
          : item.type === "Demanda"
            ? "demanda"
            : "pergunta sem resposta";
    const excerpt = (item.message || "").slice(0, 150);
    const dedupKey = `${item.group_id}|${term}`;
    if (seen.has(dedupKey)) continue;
    let alreadyResolved = false;
    for (const rk of resolvedSet) {
      if (rk.startsWith(`${item.group_id}|`) && rk.split("|")[1] === term) { alreadyResolved = true; break; }
    }
    if (alreadyResolved) continue;
    seen.set(dedupKey, {
      term,
      requested_at: item.timestamp,
      message_excerpt: excerpt,
      suggested_solution: item.suggested_action || "Equipe dar retorno ao cliente",
      priority: item.priority || "normal",
      hours_waiting: item.hours_waiting || 0,
      confidence: item.confidence || "alta",
      category: item.confidence === "media" ? "possivel" : "confirmada",
    });
  }
  return Array.from(seen.values());
}

// ─── Intent Detection ───
const INTENT_DETECTION_PROMPT = `Você é uma IA que classifica a intenção principal das últimas mensagens de clientes em grupos de WhatsApp de uma agência de marketing digital.

Classifique cada grupo em UMA das categorias:
- "Aprovação" — Cliente aguardando ou enviando aprovação de arte, campanha, post, vídeo
- "Suporte Técnico" — Problemas técnicos, bugs, site fora do ar, erro em anúncio
- "Financeiro" — Assuntos sobre pagamento, boleto, contrato, investimento, valores
- "Urgência" — Situação urgente que precisa de ação imediata
- "Informativo" — Conversa geral, alinhamento, bom dia, atualizações sem ação pendente

Analise apenas as ÚLTIMAS 5-10 mensagens do CLIENTE para determinar a intenção.
Use a função classify_intents para retornar os resultados.`;

async function detectIntentWithAI(groupConversations: Map<string, any[]>, apiKey: string): Promise<Map<string, IntentCategory>> {
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
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
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
      if (!response.ok) { console.error("AI intent error:", response.status); continue; }
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (Array.isArray(parsed.intents)) {
            for (const item of parsed.intents) {
              const validIntents = ["Aprovação", "Suporte Técnico", "Financeiro", "Urgência", "Informativo"];
              if (validIntents.includes(item.intent)) result.set(item.group_id, item.intent as IntentCategory);
            }
          }
        } catch { /* ignore */ }
      }
    } catch (err) { console.error("AI intent fetch error:", err); }
  }
  return result;
}


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

    // Fetch all conversations (paginated)
    let allConversas: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, created_at, recebido_em, direcao")
        .order("recebido_em", { ascending: true })
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

    // Fetch grupo info for investimento_ads
    const { data: gruposData } = await supabase
      .from("whatsapp_grupos")
      .select("group_id, investimento_ads");
    const grupoInvestMap = new Map<string, number | null>();
    for (const g of (gruposData || [])) {
      grupoInvestMap.set(g.group_id, g.investimento_ads);
    }

    // Group conversations by group_id
    const groupedConvs = new Map<string, any[]>();
    for (const c of allConversas) {
      if (!c.group_id) continue;
      if (!groupedConvs.has(c.group_id)) groupedConvs.set(c.group_id, []);
      groupedConvs.get(c.group_id)!.push(c);
    }

    // Step 1: Compute FRT + Sentiment for all groups
    const partialData = new Map<string, {
      avgFrt: number | null;
      sentimentResult: ReturnType<typeof computeSentiment>;
      clientMsgsCount: number;
      teamMsgsCount: number;
      engagementType: "saudável" | "cobrança" | "misto" | "inativo";
      lastMsgTime: number | null;
    }>();

    for (const [groupId, msgs] of groupedConvs) {
      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      // FRT calculation
      const BRT_OFFSET = -3;
      const BIZ_START = 8;
      const BIZ_END = 18;
      const BIZ_MINUTES_PER_DAY = (BIZ_END - BIZ_START) * 60;

      function toBrt(d: Date): Date { return new Date(d.getTime() + BRT_OFFSET * 60 * 60 * 1000); }
      function businessMinutesBetween(start: Date, end: Date): number {
        const s = toBrt(start);
        const e = toBrt(end);
        if (e <= s) return 0;
        let total = 0;
        const clampToBiz = (d: Date): Date => {
          const h = d.getHours() + d.getMinutes() / 60;
          if (h < BIZ_START) d.setHours(BIZ_START, 0, 0, 0);
          else if (h >= BIZ_END) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(BIZ_START, 0, 0, 0); }
          return d;
        };
        const cStart = clampToBiz(new Date(s));
        const cEnd = new Date(e);
        if (cStart >= cEnd) return 0;
        if (cStart.toDateString() === cEnd.toDateString()) {
          const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
          const startH = cStart.getHours() + cStart.getMinutes() / 60;
          return Math.max(0, Math.round((endH - startH) * 60));
        }
        total += (BIZ_END - (cStart.getHours() + cStart.getMinutes() / 60)) * 60;
        const nextDay = new Date(cStart);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(BIZ_START, 0, 0, 0);
        while (nextDay.toDateString() !== cEnd.toDateString()) {
          if (nextDay.getDay() !== 0 && nextDay.getDay() !== 6) total += BIZ_MINUTES_PER_DAY;
          nextDay.setDate(nextDay.getDate() + 1);
          if (total > 30 * BIZ_MINUTES_PER_DAY) break;
        }
        if (cEnd.getDay() !== 0 && cEnd.getDay() !== 6) {
          const endH = Math.min(cEnd.getHours() + cEnd.getMinutes() / 60, BIZ_END);
          if (endH > BIZ_START) total += (endH - BIZ_START) * 60;
        }
        return Math.max(0, Math.round(total));
      }

      let totalFrt = 0;
      let frtCount = 0;
      let waitingForResponse = false;
      let clientMsgTime: Date | null = null;
      for (const msg of msgs) {
        if (msg.direcao === "entrada" && !waitingForResponse) {
          if (isInformationalReport(msg.mensagem || "") || isTerminalAcknowledgement(msg.mensagem || "")) continue;
          waitingForResponse = true;
          clientMsgTime = new Date(getEffectiveTime(msg));
        } else if (msg.direcao === "saida" && waitingForResponse && clientMsgTime) {
          const bizMinutes = businessMinutesBetween(clientMsgTime, new Date(getEffectiveTime(msg)));
          if (bizMinutes > 0 && bizMinutes < 30 * BIZ_MINUTES_PER_DAY) { totalFrt += bizMinutes; frtCount++; }
          waitingForResponse = false;
          clientMsgTime = null;
        }
      }
      const avgFrt = frtCount > 0 ? Math.round(totalFrt / frtCount) : null;

      const sentimentResult = computeSentiment(clientMsgs);

      let engagementType: "saudável" | "cobrança" | "misto" | "inativo";
      if (clientMsgs.length === 0) engagementType = "inativo";
      else if (sentimentResult.positive_count > sentimentResult.complaint_count + sentimentResult.demand_count) engagementType = "saudável";
      else if (sentimentResult.complaint_count + sentimentResult.demand_count > sentimentResult.positive_count * 2) engagementType = "cobrança";
      else engagementType = "misto";

      const lastMsg = msgs[msgs.length - 1];
      const lastMsgTime = lastMsg ? new Date(getEffectiveTime(lastMsg)).getTime() : null;

      partialData.set(groupId, {
        avgFrt,
        sentimentResult,
        clientMsgsCount: clientMsgs.length,
        teamMsgsCount: teamMsgs.length,
        engagementType,
        lastMsgTime,
      });
    }

    // Step 2: Pre-filter candidates
    const allCandidates: CandidateMessage[] = [];
    for (const [groupId, msgs] of groupedConvs) {
      allCandidates.push(...preFilterMessages(groupId, msgs));
      allCandidates.push(...detectUnfulfilledTeamPromises(groupId, msgs).map((item) => ({
        mensagem: item.message,
        nome_contato: item.client_name,
        created_at: item.timestamp,
        group_id: item.group_id,
        context: msgs,
        hours_waiting: item.hours_waiting,
        is_urgent: item.priority === "urgente",
      })));
    }
    console.log(`Pre-filter: ${allCandidates.length} candidates from ${groupedConvs.size} groups`);

    // Step 3: AI detection + intent (parallel)
    let aiPendingItems: AIPendingItem[] = [];
    let intentMap = new Map<string, IntentCategory>();
    const [pendingResult, intentResult] = await Promise.allSettled([
      detectPendingWithAI(allCandidates, OPENAI_API_KEY),
      detectIntentWithAI(groupedConvs, OPENAI_API_KEY),
    ]);
    if (pendingResult.status === "fulfilled") aiPendingItems = pendingResult.value;
    else console.error("AI pending failed:", pendingResult.reason);
    for (const [groupId, msgs] of groupedConvs) {
      aiPendingItems.push(...detectUnfulfilledTeamPromises(groupId, msgs));
    }
    if (intentResult.status === "fulfilled") intentMap = intentResult.value;
    else console.error("AI intent failed:", intentResult.reason);

    // Step 4: Post-validate
    const itemsByGroup = new Map<string, AIPendingItem[]>();
    for (const item of aiPendingItems) {
      if (!itemsByGroup.has(item.group_id)) itemsByGroup.set(item.group_id, []);
      itemsByGroup.get(item.group_id)!.push(item);
    }
    const validatedByGroup = new Map<string, PendingDemandDetail[]>();
    for (const [groupId, items] of itemsByGroup) {
      const validated = postValidate(items, resolvedSet);
      if (validated.length > 0) validatedByGroup.set(groupId, validated.slice(0, 5));
    }

    // Step 4b: Sync auto-generated pending demands with the database
    const AUTO_TERMS = new Set(["demanda", "pergunta sem resposta", "agendar call"]);
    const newDemandsToInsert: { group_id: string; term: string; requested_at: string; status: string; resolved: boolean }[] = [];
    const activeAutoKeys = new Set<string>();
    for (const [groupId, details] of validatedByGroup) {
      for (const d of details) {
        if (AUTO_TERMS.has(d.term)) {
          activeAutoKeys.add(`${groupId}|${d.term}`);
        }
        let alreadyExists = false;
        for (const rk of resolvedSet) {
          const parts = rk.split("|");
          if (parts[0] === groupId && parts[1] === d.term) {
            alreadyExists = true;
            break;
          }
        }
        if (!alreadyExists) {
          newDemandsToInsert.push({
            group_id: groupId,
            term: d.term,
            requested_at: d.requested_at || new Date().toISOString(),
            status: "pendente",
            resolved: false,
          });
        }
      }
    }

    const { data: existingUnresolved } = await supabase
      .from("pending_demand_resolutions")
      .select("id, group_id, term")
      .eq("resolved", false);

    if (existingUnresolved && existingUnresolved.length > 0) {
      const staleIds = existingUnresolved
        .filter((item: any) => AUTO_TERMS.has(item.term) && !activeAutoKeys.has(`${item.group_id}|${item.term}`))
        .map((item: any) => item.id);

      if (staleIds.length > 0) {
        const { error: staleResolveError } = await supabase
          .from("pending_demand_resolutions")
          .update({ resolved: true, status: "feito", resolved_at: new Date().toISOString() })
          .in("id", staleIds);
        if (staleResolveError) console.error("Error auto-resolving stale demands:", staleResolveError);
        else console.log(`Auto-resolved ${staleIds.length} stale pending demands`);
      }
    }

    if (newDemandsToInsert.length > 0) {
      const existingKeys = new Set((existingUnresolved || []).map((e: any) => `${e.group_id}|${e.term}`));
      const truly_new = newDemandsToInsert.filter(d => !existingKeys.has(`${d.group_id}|${d.term}`));
      if (truly_new.length > 0) {
        const { error: insertError } = await supabase
          .from("pending_demand_resolutions")
          .insert(truly_new);
        if (insertError) console.error("Error inserting new demands:", insertError);
        else console.log(`Inserted ${truly_new.length} new pending demands`);
      }
    }

    // Step 5: Merge into final analytics with new churn + priority
    const analytics: Record<string, GroupAnalytics> = {};
    for (const [groupId, partial] of partialData) {
      const pendingDetails = validatedByGroup.get(groupId) || [];
      const investimento = grupoInvestMap.get(groupId) ?? null;

      const churnResult = computeChurnRisk(
        partial.sentimentResult,
        partial.avgFrt,
        pendingDetails,
        partial.lastMsgTime,
        investimento,
        null, // adScore not available here
      );

      const priorityResult = computePriority(
        partial.sentimentResult,
        churnResult.churn_risk,
        pendingDetails,
        partial.avgFrt,
        partial.lastMsgTime,
        investimento,
        null,
      );

      analytics[groupId] = {
        group_id: groupId,
        avg_frt_minutes: partial.avgFrt,
        sentiment: partial.sentimentResult.sentiment,
        sentiment_score: partial.sentimentResult.sentiment_score,
        sentiment_trend: partial.sentimentResult.sentiment_trend,
        critical_terms: partial.sentimentResult.critical_terms,
        complaint_count: partial.sentimentResult.complaint_count,
        complaint_terms: partial.sentimentResult.complaint_terms,
        positive_count: partial.sentimentResult.positive_count,
        demand_count: partial.sentimentResult.demand_count,
        engagement_type: partial.engagementType,
        churn_risk: churnResult.churn_risk,
        churn_risk_label: churnResult.churn_risk_label,
        churn_drivers: churnResult.churn_drivers,
        total_client_msgs: partial.clientMsgsCount,
        total_team_msgs: partial.teamMsgsCount,
        has_pending_demands: pendingDetails.length > 0,
        pending_demand_terms: pendingDetails.map(d => d.term),
        pending_demand_details: pendingDetails,
        intent: intentMap.get(groupId) || null,
        priority_level: priorityResult.priority_level,
        priority_reason: priorityResult.priority_reason,
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
