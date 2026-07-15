import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsApp, lookupTeamPhone } from "../_shared/evolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Alisson's phone for AI auto-reply (with country-code and 9th-digit variations)
const ALISSON_PHONES = ["64992565779", "5564992565779"];
const ALISSON_PHONE_SEND = "5564992565779";
const ALISSON_NAME_VARIANTS = ["Alisson", "Alisson Ferreira"];

// Team member name variants — phone resolved dynamically from profiles.telefone
const TEAM_NAME_VARIANTS: Record<string, string[]> = {
  "Murillo": ["Murillo", "Murilo Araújo"],
  "Murilo": ["Murillo", "Murilo Araújo"],
  "Priscilla": ["Priscilla", "Priscilla Borges"],
  "Priscila": ["Priscilla", "Priscilla Borges"],
  "Netto": ["Netto", "Netto Monge"],
  "Jader": ["Jader", "Jader Costa"],
};

// Team member phone numbers for identification
const TEAM_PHONES: Record<string, string[]> = {};

function findTeamMemberByName(pushName: string): { name: string; variants: string[] } | null {
  const normalized = (pushName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, variants] of Object.entries(TEAM_NAME_VARIANTS)) {
    if (normalized.includes(key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      return { name: key, variants };
    }
  }
  return null;
}


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

// ===== DATE RANGE DETECTION & DETERMINISTIC ADS RESPONSE =====

type DateRangeInfo = {
  since: string;
  until: string;
  explicitYear: boolean;
  startDay: string;
  startMonth: string;
  endDay: string;
  endMonth: string;
};

function buildDateRangeForYear(range: DateRangeInfo, year: number) {
  return {
    since: `${year}-${range.startMonth}-${range.startDay}`,
    until: `${year}-${range.endMonth}-${range.endDay}`,
  };
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }
function fmtDate(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function toDateRangeInfo(since: string, until: string, explicit = true): DateRangeInfo {
  const [,sm,sd] = since.split("-");
  const [,em,ed] = until.split("-");
  return { since, until, explicitYear: explicit, startDay: sd, startMonth: sm, endDay: ed, endMonth: em };
}

const MONTH_MAP: Record<string, number> = {
  janeiro: 0, fevereiro: 1, "março": 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function detectDateRangeInfo(text: string): DateRangeInfo | null {
  const now = new Date();

  const rangeMatch = text.match(/(?:entre\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*(?:a|e|até|ate|ao|à)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?(?:\s+de\s+(\d{4}))?/i);
  if (rangeMatch) {
    const trailingYear = rangeMatch[7] || null;
    const explicitYear = !!(rangeMatch[3] || rangeMatch[6] || trailingYear);
    const resolvedYear1 = rangeMatch[3] ? (rangeMatch[3].length === 2 ? `20${rangeMatch[3]}` : rangeMatch[3]) : (trailingYear || String(now.getFullYear()));
    const resolvedYear2 = rangeMatch[6] ? (rangeMatch[6].length === 2 ? `20${rangeMatch[6]}` : rangeMatch[6]) : (trailingYear || String(now.getFullYear()));
    const startDay = rangeMatch[1].padStart(2, "0");
    const startMonth = rangeMatch[2].padStart(2, "0");
    const endDay = rangeMatch[4].padStart(2, "0");
    const endMonth = rangeMatch[5].padStart(2, "0");
    return {
      since: `${resolvedYear1}-${startMonth}-${startDay}`,
      until: `${resolvedYear2}-${endMonth}-${endDay}`,
      explicitYear, startDay, startMonth, endDay, endMonth,
    };
  }

  const singleDayMatch = text.match(/dia\s+(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i);
  if (singleDayMatch) {
    const explicitYear = !!singleDayMatch[3];
    const resolvedYear = singleDayMatch[3] ? (singleDayMatch[3].length === 2 ? `20${singleDayMatch[3]}` : singleDayMatch[3]) : String(now.getFullYear());
    const day = singleDayMatch[1].padStart(2, "0");
    const month = singleDayMatch[2].padStart(2, "0");
    const date = `${resolvedYear}-${month}-${day}`;
    return toDateRangeInfo(date, date, explicitYear);
  }

  if (/\bhoje\b/i.test(text)) {
    const d = fmtDate(now);
    return toDateRangeInfo(d, d);
  }

  if (/\bontem\b/i.test(text)) {
    const d = fmtDate(new Date(now.getTime() - 86400000));
    return toDateRangeInfo(d, d);
  }

  if (/\b(esta|essa|nesta|nessa)\s+semana\b|\bsemana\s+atual\b/i.test(text)) {
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return toDateRangeInfo(fmtDate(monday), fmtDate(now));
  }

  if (/\bsemana\s+passada\b|\b[uú]ltima\s+semana\b/i.test(text)) {
    const dayOfWeek = now.getDay();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    return toDateRangeInfo(fmtDate(lastMonday), fmtDate(lastSunday));
  }

  if (/\b(este|esse|neste|nesse)\s+m[eê]s\b|\bm[eê]s\s+atual\b/i.test(text)) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return toDateRangeInfo(fmtDate(first), fmtDate(now));
  }

  if (/\bm[eê]s\s+passado\b|\b[uú]ltimo\s+m[eê]s\b/i.test(text)) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return toDateRangeInfo(fmtDate(first), fmtDate(last));
  }

  const lastNDays = text.match(/[uú]ltimos?\s+(\d+)\s+dias?/i);
  if (lastNDays) {
    const n = parseInt(lastNDays[1]);
    const start = new Date(now.getTime() - n * 86400000);
    return toDateRangeInfo(fmtDate(start), fmtDate(now));
  }

  const monthNameMatch = text.match(/(?:em|no\s+m[eê]s\s+de|de)\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(?:de\s+)?(\d{4}))?/i);
  if (monthNameMatch) {
    const monthName = monthNameMatch[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const monthIdx = MONTH_MAP[monthName];
    if (monthIdx !== undefined) {
      const year = monthNameMatch[2] ? parseInt(monthNameMatch[2]) : now.getFullYear();
      const first = new Date(year, monthIdx, 1);
      const last = new Date(year, monthIdx + 1, 0);
      const until = last > now ? now : last;
      return toDateRangeInfo(fmtDate(first), fmtDate(until));
    }
  }

  return null;
}

function normalizeGroupName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^nv\s*-\s*/i, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isExactAdsSpendQuery(text: string): boolean {
  const lower = text.toLowerCase();
  const hasAdsIntent = ["investimento", "gasto", "gastou", "valor investido", "valor", "quanto", "quanto foi", "total", "meta ads", "ads"].some(k => lower.includes(k));
  return hasAdsIntent && !!detectDateRangeInfo(text);
}

/**
 * Try to answer an exact ads spend query deterministically. Returns the reply string or null if not applicable.
 */
async function tryExactAdsReply(
  messageText: string,
  grupos: any[],
  metaToken: string
): Promise<string | null> {
  if (!isExactAdsSpendQuery(messageText)) return null;
  const dateRangeInfo = detectDateRangeInfo(messageText);
  if (!dateRangeInfo) return null;

  const normalizedUserText = normalizeGroupName(messageText);
  const matchedGroup = grupos.find((g: any) => {
    const normalizedName = normalizeGroupName(g.nome || "");
    return normalizedUserText.includes(normalizedName);
  });

  if (!matchedGroup || !matchedGroup.ad_account_id) {
    if (matchedGroup) return `${matchedGroup.nome.replace(/^NV\s*-\s*/i, "")} não possui conta de Meta Ads vinculada.`;
    return null; // let AI handle it
  }

  const formatPeriod = (since: string, until: string) => {
    const formatOne = (v: string) => { const [y, m, d] = v.split("-"); return `${d}/${m}/${y}`; };
    return `${formatOne(since)} a ${formatOne(until)}`;
  };

  let resolvedAds: any = null;
  let resolvedRange = { since: dateRangeInfo.since, until: dateRangeInfo.until };

  if (!dateRangeInfo.explicitYear) {
    const currentYear = new Date().getFullYear();
    const currentRange = buildDateRangeForYear(dateRangeInfo, currentYear);
    const previousRange = buildDateRangeForYear(dateRangeInfo, currentYear - 1);
    const [currentAds, previousAds] = await Promise.all([
      fetchMetaAdsForAccount(matchedGroup.ad_account_id, metaToken, undefined, currentRange.since, currentRange.until),
      fetchMetaAdsForAccount(matchedGroup.ad_account_id, metaToken, undefined, previousRange.since, previousRange.until),
    ]);
    const hasCurrentData = !!currentAds && currentAds.spend > 0;
    const hasPreviousData = !!previousAds && previousAds.spend > 0;
    if (hasCurrentData && hasPreviousData) {
      return `Encontrei dados para mais de um ano no intervalo ${dateRangeInfo.startDay}/${dateRangeInfo.startMonth} a ${dateRangeInfo.endDay}/${dateRangeInfo.endMonth}. Para te responder com precisão, me diga se você quer ${currentYear} ou ${currentYear - 1}.`;
    }
    if (hasCurrentData) { resolvedAds = currentAds; resolvedRange = currentRange; }
    else if (hasPreviousData) { resolvedAds = previousAds; resolvedRange = previousRange; }
  } else {
    resolvedAds = await fetchMetaAdsForAccount(matchedGroup.ad_account_id, metaToken, undefined, dateRangeInfo.since, dateRangeInfo.until);
    resolvedRange = { since: dateRangeInfo.since, until: dateRangeInfo.until };
  }

  const clientName = matchedGroup.nome.replace(/^NV\s*-\s*/i, "").trim();
  if (resolvedAds) {
    return `O gasto total do Meta Ads de ${clientName} no período de ${formatPeriod(resolvedRange.since, resolvedRange.until)} foi de R$${resolvedAds.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. (${resolvedAds.impressions} impressões, ${resolvedAds.clicks} cliques, CTR ${resolvedAds.ctr.toFixed(2)}%, ${resolvedAds.leads} leads${resolvedAds.cpa ? `, CPA R$${resolvedAds.cpa.toFixed(2)}` : ""})`;
  }
  return `Não encontrei dados de Meta Ads para ${clientName} no período de ${formatPeriod(resolvedRange.since, resolvedRange.until)}.`;
}

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function fetchMetaAdsForAccount(accountId: string, token: string, datePreset?: string, since?: string, until?: string): Promise<any | null> {
  try {
    const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const fields = "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,reach,frequency";
    let dateFilter = "";
    if (since && until) {
      dateFilter = `&time_range={"since":"${since}","until":"${until}"}`;
    } else {
      dateFilter = `&date_preset=${datePreset || "last_30d"}`;
    }
    const url = `${META_BASE}/${actId}/insights?fields=${fields}${dateFilter}&access_token=${token}`;
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

// Feedback analysis tools (available to ALL team members)
const FEEDBACK_TOOLS = [
  {
    type: "function",
    function: {
      name: "salvar_nota_cliente",
      description: "Salva uma nota no card do cliente quando o membro da equipe relata algo relevante feito para aquele cliente (ex: subiu campanha nova, fez reunião, ajustou anúncios, resolveu problema). Use SEMPRE que a mensagem mencionar uma ação específica feita para um cliente.",
      parameters: {
        type: "object",
        properties: {
          group_name: { type: "string", description: "Nome do grupo/cliente mencionado" },
          note_content: { type: "string", description: "Conteúdo da nota descrevendo o que foi feito. Escreva em terceira pessoa (ex: 'Priscilla subiu estrutura nova de anúncios')" },
        },
        required: ["group_name", "note_content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_feedback",
      description: "Registra um feedback ou informação do membro da equipe para contexto geral da Vox. Use para qualquer informação que não seja diretamente uma ação em um cliente mas que enriquece o contexto (ex: 'hoje foi corrido', 'estou focado em prospecção', comentários gerais sobre o dia).",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["acao_cliente", "feedback_dia", "insight", "geral"], description: "Categoria do feedback" },
          message_summary: { type: "string", description: "Resumo do que foi dito" },
          group_name: { type: "string", description: "Nome do cliente se mencionado (opcional)", nullable: true },
          relevance: { type: "string", enum: ["low", "medium", "high"], description: "Relevância da informação" },
        },
        required: ["category", "message_summary", "relevance"],
        additionalProperties: false,
      },
    },
  },
];

// OpenAI tools for the WhatsApp agent
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "criar_pendencia",
      description: "Cria uma pendência para um colaborador responsável em um cliente específico. Use somente quando Alisson pedir para criar, adicionar ou designar uma nova pendência.",
      parameters: {
        type: "object",
        properties: {
          group_name: { type: "string", description: "Nome do grupo/cliente (parcial ou completo)" },
          term: { type: "string", description: "Descrição da pendência" },
          responsible: { type: "string", description: "Nome do responsável (ex: Jader Costa, Murilo Araújo, Netto Monge)" },
          due_date: { type: "string", description: "Data de prazo no formato YYYY-MM-DD (opcional)", nullable: true },
          priority: { type: "string", enum: ["urgente", "normal", "baixa"], description: "Prioridade da pendência" }
        },
        required: ["group_name", "term", "responsible", "priority"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remover_pendencias",
      description: "Remove pendências existentes do quadro. Use quando Alisson pedir para remover, apagar, excluir, limpar ou tirar pendências do quadro de uma ou mais pessoas.",
      parameters: {
        type: "object",
        properties: {
          responsibles: {
            type: "array",
            description: "Lista de responsáveis cujas pendências devem ser removidas",
            items: { type: "string" }
          },
          status: {
            type: "string",
            enum: ["pendente", "fazendo", "feito", "todos"],
            description: "Coluna alvo do quadro; use 'pendente' para 'a fazer' e 'todos' quando não especificado"
          },
          group_name: { type: "string", description: "Cliente/grupo específico (opcional)", nullable: true }
        },
        required: ["responsibles", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description: "Cria uma tarefa para um membro da equipe. SEMPRE tente identificar o cliente mencionado na mensagem e preencha group_name com o nome EXATO do grupo/cliente no sistema. O title deve ser o nome do cliente (ex: 'MKT NV - ORALCENTER CATALÃO'). A description deve conter a tarefa em si (ex: 'Recriar campanha no Google Ads').",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Nome do cliente/grupo no sistema (ex: 'MKT NV - ORALCENTER CATALÃO'). Se não houver cliente, use um título descritivo curto." },
          description: { type: "string", description: "Descrição detalhada da tarefa a ser realizada (ex: 'Recriar campanha no Google Ads', 'Agendar reunião de alinhamento')" },
          assigned_to: { type: "string", description: "Nome do responsável (ex: Jader Costa, Murilo Araújo, Netto Monge, Priscilla Borges, Joel, Thais, Daniella, Victor Botto, Jiza Reis)" },
          group_name: { type: "string", description: "Nome do cliente/grupo associado — SEMPRE preencha se mencionarem um cliente, mesmo parcialmente (ex: 'oral center', 'idonea', 'reabilis'). Busque o nome mais próximo da lista de grupos disponíveis.", nullable: true },
          due_date: { type: "string", description: "Data de prazo no formato YYYY-MM-DD (opcional)", nullable: true },
          priority: { type: "string", enum: ["urgente", "normal", "baixa"], description: "Prioridade da tarefa" }
        },
        required: ["title", "assigned_to", "priority", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remover_tarefas",
      description: "Remove tarefas existentes do quadro de tarefas. Use quando Alisson pedir para remover, apagar, excluir, limpar ou tirar tarefas de uma ou mais pessoas.",
      parameters: {
        type: "object",
        properties: {
          responsibles: {
            type: "array",
            description: "Lista de responsáveis cujas tarefas devem ser removidas",
            items: { type: "string" }
          },
          status: {
            type: "string",
            enum: ["pendente", "fazendo", "feito", "todos"],
            description: "Coluna alvo do quadro; use 'pendente' para 'a fazer' e 'todos' quando não especificado"
          },
          group_name: { type: "string", description: "Cliente/grupo específico (opcional)", nullable: true }
        },
        required: ["responsibles", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "perguntar_detalhes",
      description: "Envia uma pergunta de volta ao usuário via WhatsApp para obter mais detalhes antes de executar uma ação. Use quando faltarem informações essenciais para completar uma tarefa.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "A pergunta a ser enviada" }
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_cutucada",
      description: "Envia uma cutucada (nudge/lembrete) imediata para um membro da equipe via WhatsApp. Use quando pedirem para enviar cutucada, lembrar, cobrar, ou cutucar alguém da equipe. Pode ser sobre um cliente específico ou geral.",
      parameters: {
        type: "object",
        properties: {
          destinatario: { type: "string", description: "Nome do destinatário da cutucada (ex: Murilo Araújo, Netto Monge, Jader Costa, Priscilla)" },
          mensagem_contexto: { type: "string", description: "Contexto ou motivo da cutucada (ex: 'tarefas pendentes', 'relatório atrasado', 'cliente esperando resposta')" },
          group_name: { type: "string", description: "Nome do cliente/grupo relacionado (opcional)", nullable: true },
          tipo: { type: "string", enum: ["pendencia_esquecida", "frt_alto", "grupo_parado", "geral", "tarefa_pendente"], description: "Tipo da cutucada" }
        },
        required: ["destinatario", "mensagem_contexto", "tipo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolver_pendencia",
      description: "Marca uma pendência específica como resolvida (feito). Use quando o membro da equipe confirmar que resolveu/fez/completou uma pendência de um cliente (ex: 'já resolvi', 'feito', 'já enviei', 'tá pronto').",
      parameters: {
        type: "object",
        properties: {
          group_name: { type: "string", description: "Nome do grupo/cliente cuja pendência foi resolvida" },
          term_hint: { type: "string", description: "Parte do termo/descrição da pendência para identificá-la (opcional)", nullable: true },
        },
        required: ["group_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editar_prompt",
      description: "Edita um prompt ou regra de IA do sistema Vox. Use quando Alisson pedir para mudar, alterar, editar, atualizar qualquer prompt, regra, instrução ou comportamento da IA. SOMENTE Alisson pode usar esta ferramenta.",
      parameters: {
        type: "object",
        properties: {
          prompt_key: { type: "string", description: "Chave do prompt a editar (ex: vox_chat_system_prompt, vox_master_prompt, equipe_info, regras_negocio, vox_whatsapp_alisson_prompt, vox_whatsapp_team_prompt, daily_feedback_system_prompt, daily_feedback_rules, executive_briefing_prompt, cs_coach_nudge_prompt)" },
          new_value: { type: "string", description: "Novo conteúdo completo do prompt" },
          description_hint: { type: "string", description: "Breve descrição do que foi alterado", nullable: true },
        },
        required: ["prompt_key", "new_value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editar_config_sistema",
      description: "Edita uma configuração/regra do sistema (SLA, sentimento, churn, FRT, prioridade, filtros, equipe, etc). Use quando Alisson pedir para mudar qualquer parâmetro, limiar, peso, tempo, regra ou configuração operacional do sistema. Exemplos: mudar tempo de SLA, alterar peso de sentimento, mudar limiar de churn, adicionar palavras-chave, etc. SOMENTE Alisson pode usar.",
      parameters: {
        type: "object",
        properties: {
          config_key: { type: "string", description: "Chave da configuração (ex: sla_response_minutes, sentiment_critical_weight, churn_label_critico, frt_excellent_max, priority_churn_threshold, team_members, sentiment_critical_terms, etc). Se não souber a chave exata, use a mais próxima." },
          new_value: { type: "string", description: "Novo valor da configuração" },
        },
        required: ["config_key", "new_value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_evento",
      description: "Agenda um evento/compromisso/reunião na agenda interna do sistema. Use quando pedirem para agendar, marcar, criar reunião, compromisso, encontro, call, ou qualquer evento na agenda. NÃO use criar_tarefa para compromissos — use ESTA ferramenta.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título do evento (ex: 'Reunião com Dra. Tatiane')" },
          description: { type: "string", description: "Descrição do evento (detalhes, pauta, etc)", nullable: true },
          start_time: { type: "string", description: "Data/hora de início no formato ISO 8601 (ex: '2026-04-09T14:00:00'). Se só informarem a data, use 09:00 como hora padrão." },
          end_time: { type: "string", description: "Data/hora de término no formato ISO 8601. Se não informarem, adicione 1 hora ao início.", nullable: true },
          participants: { type: "array", items: { type: "string" }, description: "Lista de participantes (nomes da equipe e/ou externos)" },
          group_name: { type: "string", description: "Nome do cliente/grupo relacionado (opcional)", nullable: true },
          event_type: { type: "string", enum: ["reuniao", "call", "compromisso", "lembrete", "outro"], description: "Tipo do evento" },
          location: { type: "string", description: "Local do evento (opcional)", nullable: true },
        },
        required: ["title", "start_time", "participants", "event_type"],
        additionalProperties: false,
      },
    },
  },
  // Include feedback tools in the agent tools too
  ...FEEDBACK_TOOLS,
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

    // Load configurable prompts from DB
    const { data: promptConfigs } = await supabase.from("ai_prompts_config").select("prompt_key, prompt_value");
    const promptMap = new Map<string, string>();
    for (const pc of (promptConfigs || [])) promptMap.set(pc.prompt_key, pc.prompt_value);

    // Fetch all groups
    const { data: grupos } = await supabase.from("whatsapp_grupos").select("*").order("nome");
    if (!grupos?.length) return;

    // === DETERMINISTIC ADS RESPONSE (before heavy context loading) ===
    if (META_TOKEN && isExactAdsSpendQuery(messageText)) {
      const exactReply = await tryExactAdsReply(messageText, grupos, META_TOKEN);
      if (exactReply) {
        console.log("Deterministic ads reply for Alisson:", exactReply.substring(0, 80));
        await supabase.from("whatsapp_conversas").insert({
          telefone: "5564992565779",
          nome_contato: "Vox (IA)",
          mensagem: exactReply,
          group_id: groupId,
          direcao: "saida",
          status: "enviada",
          recebido_em: new Date().toISOString(),
        });
        await fetch(ALISSON_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: "5564992565779", message: exactReply, groupId, type: "ai_response" }),
        });
        return;
      }
    }

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

    // Fetch recent coach messages for context about cutucadas
    const coachMsgsPromise = supabase
      .from("coach_messages")
      .select("destinatario_nome, mensagem, tipo, group_id, enviada_em, resultado")
      .eq("enviada", true)
      .order("enviada_em", { ascending: false })
      .limit(30);

    const [pendingResResult, coachMsgsResult, ...conversasResults] = await Promise.all([
      pendingResPromise,
      coachMsgsPromise,
      ...conversasPromises,
    ]);

    const pendingResolutions = pendingResResult.data || [];
    const recentCoachMsgs = coachMsgsResult.data || [];
    const groupMsgsMap = new Map<string, any[]>();
    for (let i = 0; i < groupIds.length; i++) {
      groupMsgsMap.set(groupIds[i], conversasResults[i].data || []);
    }

    // Fetch ads data (30d + today)
    const groupsWithAds = grupos.filter((g: any) => g.ad_account_id);
    const adsDataMap = new Map<string, any>();
    const adsTodayMap = new Map<string, any>();
    const todayStr = new Date().toISOString().slice(0, 10);

    // Detect if user is asking about a specific date range
    const detectedRange = detectDateRangeInfo(messageText);
    const adsCustomRangeMap = new Map<string, any>();

    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        const fetches: Promise<any>[] = [
          fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN),
          fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN, undefined, todayStr, todayStr),
        ];
        if (detectedRange) {
          fetches.push(fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN, undefined, detectedRange.since, detectedRange.until));
        }
        const results = await Promise.all(fetches);
        if (results[0]) adsDataMap.set(g.group_id, results[0]);
        if (results[1]) adsTodayMap.set(g.group_id, results[1]);
        if (detectedRange && results[2]) adsCustomRangeMap.set(g.group_id, results[2]);
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
      const adsToday = adsTodayMap.get(gid);

      let line = `### ${g.nome}`;
      line += `\n  Group ID: ${gid}`;
      line += `\n  Responsável CS: ${g.gestor_responsavel || "Não definido"}`;
      line += `\n  Plano: ${g.plano || "N/A"} | Investimento ads: ${g.investimento_ads ? `R$${g.investimento_ads}` : "N/A"}`;
      line += `\n  Categoria: ${g.categoria || "Sem categoria"}`;
      if (g.acessos_cliente) line += `\n  🔑 Acessos do cliente: ${g.acessos_cliente}`;
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
      if (adsToday) {
        line += `\n  📊 META ADS (HOJE ${todayStr}): Gasto R$${adsToday.spend.toFixed(2)}, ${adsToday.impressions} impressões, ${adsToday.clicks} cliques, CTR ${adsToday.ctr.toFixed(2)}%, Leads ${adsToday.leads}${adsToday.cpa ? `, CPA R$${adsToday.cpa.toFixed(2)}` : ""}, Alcance ${adsToday.reach}`;
      }
      const adsCustom = adsCustomRangeMap.get(gid);
      if (adsCustom && detectedRange) {
        line += `\n  📊 META ADS (${detectedRange.since} a ${detectedRange.until}): Gasto R$${adsCustom.spend.toFixed(2)}, ${adsCustom.impressions} impressões, ${adsCustom.clicks} cliques, CTR ${adsCustom.ctr.toFixed(2)}%, Leads ${adsCustom.leads}${adsCustom.cpa ? `, CPA R$${adsCustom.cpa.toFixed(2)}` : ""}, Alcance ${adsCustom.reach}`;
      }
      if (ads) {
        line += `\n  📊 META ADS (30d): Gasto R$${ads.spend.toFixed(2)}, ${ads.impressions} impressões, ${ads.clicks} cliques, CTR ${ads.ctr.toFixed(2)}%, CPC R$${ads.cpc.toFixed(2)}, Leads ${ads.leads}${ads.cpa ? `, CPA R$${ads.cpa.toFixed(2)}` : ""}, Alcance ${ads.reach}`;
      } else if (g.ad_account_id && !adsToday) {
        line += `\n  📊 META ADS: Conta vinculada mas sem dados`;
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

    const DB_ALISSON_PROMPT = promptMap.get("vox_whatsapp_alisson_prompt");
    const systemPrompt = `${DB_ALISSON_PROMPT || "Você é a Vox, analista sênior de Customer Success da agência de marketing digital New Vox. Você está respondendo diretamente ao Alisson (sócio proprietário) via WhatsApp. Você é o agente pessoal dele para gestão da operação."}

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

4. CRIAR TAREFAS — Para tarefas do dia a dia, use "criar_tarefa". REGRA IMPORTANTE: Quando a mensagem mencionar um cliente (mesmo parcialmente, ex: "oral center", "reabilis", "idonea"), você DEVE:
   a) Preencher "group_name" com o nome do cliente mencionado
   b) Usar o NOME COMPLETO do grupo/cliente no campo "title" (ex: "MKT NV - ORALCENTER CATALÃO")
   c) Colocar a AÇÃO/TAREFA no campo "description" (ex: "Recriar campanha no Google Ads")
   d) Buscar na lista de grupos o nome mais próximo do que foi mencionado
   Se NÃO houver cliente, use um título descritivo e a tarefa na descrição.

5. AGENDAR EVENTOS/COMPROMISSOS — Quando pedirem para AGENDAR, MARCAR, criar REUNIÃO, COMPROMISSO, CALL, ENCONTRO, ou qualquer evento com data/hora, use "agendar_evento" (NÃO use criar_tarefa). A ferramenta agenda na agenda interna do sistema. Inclua participantes, data/hora e tipo do evento.

6. PEDIR DETALHES — Se faltar informação essencial para executar uma ação (ex: qual cliente, qual prazo, qual responsável), use a ferramenta "perguntar_detalhes" para perguntar ao Alisson antes de agir.

5. ANÁLISE DE EQUIPE — Performance individual dos gestores, volume de respostas, FRT por responsável.

6. ANÁLISE DE ADS — Métricas de anúncios Meta por cliente: gasto, leads, CPA, CTR, alcance.

7. ALERTAS E URGÊNCIAS — Pendências abertas, clientes inativos, sentimento piorando, SLA violado.

12. CONSULTA DE ACESSOS — Quando alguém perguntar sobre acessos, login, senha, credenciais, hospedagem ou domínio de um cliente, verifique o campo "Acessos do cliente" nos dados. Se a informação estiver disponível, envie IMEDIATAMENTE e completa. Se não houver, informe que o campo está vazio e sugira preencher na aba Informações do card do cliente.

8. RECOMENDAÇÕES PROATIVAS — Ações prioritárias com QUEM deve fazer, PARA QUAL cliente, e POR QUÊ.

9. ENVIAR CUTUCADA — Quando Alisson pedir para cutucar, lembrar, cobrar ou enviar cutucada para alguém da equipe, use "enviar_cutucada". A cutucada será enviada IMEDIATAMENTE via WhatsApp para a pessoa.

10. EDITAR PROMPTS/REGRAS DA IA — Quando Alisson pedir para mudar, alterar, editar, atualizar qualquer prompt, regra, instrução ou comportamento da IA/Vox, use "editar_prompt". Chaves disponíveis: vox_chat_system_prompt, vox_master_prompt, equipe_info, regras_negocio, vox_whatsapp_alisson_prompt, vox_whatsapp_team_prompt, daily_feedback_system_prompt, daily_feedback_rules, executive_briefing_prompt, cs_coach_nudge_prompt. Se Alisson pedir para mudar algo que não corresponde a nenhuma chave existente, pergunte antes de agir.

REGRAS:
- Responda DIRETO e CONCISO (máximo 400 palavras) — é WhatsApp
- Use emojis com moderação: 🔴 crítico, 🟡 atenção, 🟢 ok, ⚡ urgente, 📊 dados, 📋 tarefas
- NUNCA invente dados. Se não tem, diga
- Quando sugerir ações, diga QUEM da equipe deve fazer (use nomes)
- Benchmarks: FRT ideal <30min, bom até 60, ruim >120. Churn <30 tranquilo, >60 ação necessária
- Se Alisson der um COMANDO operacional explícito (ex: remover, excluir, apagar, limpar, criar, pausar, cutucar, cutucada), você DEVE executar a ação correspondente pela ferramenta correta em vez de reinterpretar como sugestão
- Se Alisson pedir para remover algo do quadro, use remover_pendencias ou remover_tarefas; NÃO crie novos itens para simular a remoção
- Se Alisson falar algo sem contexto claro, tente inferir ou pergunte usando a ferramenta
- Formate para WhatsApp (texto simples, sem markdown complexo, use * para negrito)
- Quando perguntarem sobre cutucadas (planejamento, histórico, próximas), consulte o histórico de cutucadas abaixo para responder com precisão
- IMPORTANTE: Quando houver dados de Meta Ads para um PERÍODO ESPECÍFICO nos dados abaixo, use EXATAMENTE esses valores ao responder. NUNCA estime ou arredonde. Reporte os números tal qual apareceram e mencione o período exato.

DADOS DA OPERAÇÃO EM TEMPO REAL (${grupos.length} grupos, ${totalMsgs} mensagens, ${adsDataMap.size} contas de ads):

${contextLines.join("\n\n")}

HISTÓRICO DE CUTUCADAS RECENTES (últimas 30):
${recentCoachMsgs.map((m: any) => `- [${m.enviada_em}] Para: ${m.destinatario_nome} | Tipo: ${m.tipo}${m.group_id ? ` | Cliente: ${grupos.find((g: any) => g.group_id === m.group_id)?.nome || m.group_id}` : ""} | Status: ${m.resultado || "enviada"} | Msg: "${m.mensagem?.slice(0, 80)}"`).join("\n") || "Nenhuma cutucada recente."}

NOTA: As cutucadas automáticas são enviadas pelo CS Coach em horário comercial (08:30-17:30, seg-sex). Você também pode enviar cutucadas manuais sob demanda usando a ferramenta "enviar_cutucada".`;

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
          }
        } else {
          toolResults.push(`❌ Cliente "${args.group_name}" não encontrado.`);
        }
      }

      if (fnName === "remover_pendencias") {
        const responsibles = Array.isArray(args.responsibles) ? args.responsibles.filter(Boolean) : [];
        const normalizedStatus = args.status === "todos" ? null : (args.status || "pendente");
        let groupIds: string[] | null = null;

        if (args.group_name) {
          groupIds = grupos
            .filter((g: any) =>
              g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
              args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
            )
            .map((g: any) => g.group_id);
        }

        const { data: existing, error: fetchErr } = await supabase
          .from("pending_demand_resolutions")
          .select("id, term, group_id, status, resolved");

        if (fetchErr) {
          toolResults.push(`❌ Erro ao buscar pendências: ${fetchErr.message}`);
        } else {
          const idsToDelete = (existing || [])
            .filter((item: any) => {
              const term = (item.term || "").toLowerCase();
              const responsibleMatch = responsibles.length === 0 || responsibles.some((name: string) => term.includes(name.toLowerCase()));
              const statusMatch = !normalizedStatus || item.status === normalizedStatus;
              const groupMatch = !groupIds || groupIds.includes(item.group_id);
              return responsibleMatch && statusMatch && groupMatch;
            })
            .map((item: any) => item.id);

          if (idsToDelete.length === 0) {
            toolResults.push(`⚠️ Nenhuma pendência encontrada para remover.`);
          } else {
            const { error: deleteErr } = await supabase.from("pending_demand_resolutions").delete().in("id", idsToDelete);
            if (deleteErr) {
              toolResults.push(`❌ Erro ao remover pendências: ${deleteErr.message}`);
            } else {
              toolResults.push(`✅ ${idsToDelete.length} pendência(s) removida(s) do quadro${responsibles.length ? ` de ${responsibles.join(", ")}` : ""}.`);
            }
          }
        }
      }

      if (fnName === "criar_tarefa") {
        let matchedGroupId: string | null = null;
        let matchedGroupName: string | null = null;
        if (args.group_name) {
          const searchTerm = args.group_name.toLowerCase().trim();
          const matchedGroup = grupos.find((g: any) => {
            const nome = g.nome.toLowerCase();
            const nomeClean = nome.replace(/nv[-\s]*mkt\s*/g, "").replace(/mkt\s*nv[-\s]*/g, "").replace(/nv[-\s]*/g, "").trim();
            return nome.includes(searchTerm) || searchTerm.includes(nomeClean) || nomeClean.includes(searchTerm) ||
              searchTerm.split(/\s+/).every((w: string) => nome.includes(w));
          });
          matchedGroupId = matchedGroup?.group_id || null;
          matchedGroupName = matchedGroup?.nome || null;
        }

        const taskTitle = matchedGroupName || args.title;

        const { error: insertErr } = await supabase.from("tasks").insert({
          title: taskTitle,
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
          toolResults.push(`✅ Tarefa criada: "${taskTitle}" para ${args.assigned_to}${matchedGroupName ? ` (cliente: ${matchedGroupName})` : ""}${args.due_date ? ` prazo: ${args.due_date}` : ""}\n📝 ${args.description || ""}`);
        }
      }

      if (fnName === "agendar_evento") {
        let matchedGroupId: string | null = null;
        if (args.group_name) {
          const searchTerm = args.group_name.toLowerCase().trim();
          const mg = grupos.find((g: any) => {
            const nome = g.nome.toLowerCase();
            const nomeClean = nome.replace(/nv[-\s]*mkt\s*/g, "").replace(/mkt\s*nv[-\s]*/g, "").replace(/nv[-\s]*/g, "").trim();
            return nome.includes(searchTerm) || searchTerm.includes(nomeClean) || nomeClean.includes(searchTerm);
          });
          matchedGroupId = mg?.group_id || null;
        }
        const startTime = args.start_time || new Date().toISOString();
        const endTime = args.end_time || new Date(new Date(startTime).getTime() + 3600000).toISOString();
        const participants = Array.isArray(args.participants) ? args.participants : [];

        const { error: insertErr } = await supabase.from("calendar_events").insert({
          title: args.title,
          description: args.description || null,
          start_time: startTime,
          end_time: endTime,
          participants: participants,
          group_id: matchedGroupId,
          event_type: args.event_type || "reuniao",
          location: args.location || null,
          created_by: "Alisson Lima (via WhatsApp)",
        });

        if (insertErr) {
          console.error("Error creating calendar event:", insertErr);
          toolResults.push(`❌ Erro ao agendar evento: ${insertErr.message}`);
        } else {
          const dateStr = new Date(startTime).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
          toolResults.push(`✅ Evento agendado: "${args.title}" em ${dateStr}${participants.length ? ` com ${participants.join(", ")}` : ""}`);
        }
      }


      if (fnName === "remover_tarefas") {
        const responsibles = Array.isArray(args.responsibles) ? args.responsibles.filter(Boolean) : [];
        const normalizedStatus = args.status === "todos" ? null : (args.status || "pendente");
        let groupIds: string[] | null = null;

        if (args.group_name) {
          groupIds = grupos
            .filter((g: any) =>
              g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
              args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
            )
            .map((g: any) => g.group_id);
        }

        const { data: existing, error: fetchErr } = await supabase
          .from("tasks")
          .select("id, assigned_to, status, group_id");

        if (fetchErr) {
          toolResults.push(`❌ Erro ao buscar tarefas: ${fetchErr.message}`);
        } else {
          const idsToDelete = (existing || [])
            .filter((item: any) => {
              const assigned = (item.assigned_to || "").toLowerCase();
              const responsibleMatch = responsibles.length === 0 || responsibles.some((name: string) => assigned.includes(name.toLowerCase()));
              const statusMatch = !normalizedStatus || item.status === normalizedStatus;
              const groupMatch = !groupIds || groupIds.includes(item.group_id);
              return responsibleMatch && statusMatch && groupMatch;
            })
            .map((item: any) => item.id);

          if (idsToDelete.length === 0) {
            toolResults.push(`⚠️ Nenhuma tarefa encontrada para remover.`);
          } else {
            const { error: deleteErr } = await supabase.from("tasks").delete().in("id", idsToDelete);
            if (deleteErr) {
              toolResults.push(`❌ Erro ao remover tarefas: ${deleteErr.message}`);
            } else {
              toolResults.push(`✅ ${idsToDelete.length} tarefa(s) removida(s) do quadro${responsibles.length ? ` de ${responsibles.join(", ")}` : ""}.`);
            }
          }
        }
      }

      if (fnName === "perguntar_detalhes") {
        aiReply = args.question;
        console.log("AI asking follow-up question:", args.question);
      }

      if (fnName === "enviar_cutucada") {
        // Find the webhook for the target person
        const targetName = args.destinatario;
        const targetWebhookUrl = Object.entries(TEAM_WEBHOOK_MAP).find(([key]) =>
          targetName.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(targetName.toLowerCase().split(" ")[0])
        )?.[1];

        if (!targetWebhookUrl) {
          toolResults.push(`❌ Não encontrei webhook para "${targetName}". Pessoas disponíveis: ${Object.keys(TEAM_WEBHOOK_MAP).join(", ")}`);
        } else {
          // Find matched group if specified
          let matchedGroup: any = null;
          if (args.group_name) {
            matchedGroup = grupos.find((g: any) =>
              g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
              args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
            );
          }

          // Generate cutucada message with AI
          const firstName = targetName.split(" ")[0];
          const OPENAI_API_KEY_COACH = Deno.env.get("openai");
          const coachAiUrl = "https://api.openai.com/v1/chat/completions";
          const coachAiKey = OPENAI_API_KEY_COACH;

          let cutucadaMsg = "";
          try {
            const coachResp = await fetch(coachAiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${coachAiKey}` },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: `Você é a Vox, coach de CS da agência New Vox. Gere uma mensagem curta e direta de cutucada para ${firstName} via WhatsApp. Tom de colega gente boa, informal, incentivador. Máximo 300 caracteres. Adicione "(responda 👍 se já fez)" no final.` },
                  { role: "user", content: `Cutucada para ${firstName}: ${args.mensagem_contexto}${matchedGroup ? ` (cliente: ${matchedGroup.nome})` : ""}` },
                ],
                max_tokens: 200,
              }),
            });
            if (coachResp.ok) {
              const coachData = await coachResp.json();
              cutucadaMsg = coachData.choices?.[0]?.message?.content?.trim() || "";
            }
          } catch (e) {
            console.error("Error generating cutucada:", e);
          }

          if (!cutucadaMsg) {
            cutucadaMsg = `E aí ${firstName}! 👋 ${args.mensagem_contexto}${matchedGroup ? ` (${matchedGroup.nome})` : ""}. Bora resolver isso? (responda 👍 se já fez)`;
          }

          // Send via webhook
          try {
            const encodedMsg = encodeURIComponent(cutucadaMsg);
            const sendResp = await fetch(`${targetWebhookUrl}?message=${encodedMsg}`);
            console.log(`Cutucada sent to ${targetName}: ${sendResp.status}`);

            // Save to coach_messages
            await supabase.from("coach_messages").insert({
              destinatario_nome: targetName,
              mensagem: cutucadaMsg,
              tipo: args.tipo || "geral",
              group_id: matchedGroup?.group_id || null,
              enviada: true,
              enviada_em: new Date().toISOString(),
            });

            toolResults.push(`✅ Cutucada enviada para ${targetName}! Mensagem: "${cutucadaMsg.slice(0, 80)}..."`);
          } catch (e) {
            console.error(`Failed to send cutucada to ${targetName}:`, e);
            toolResults.push(`❌ Erro ao enviar cutucada para ${targetName}`);
          }
        }
      }

      // Handle salvar_nota_cliente
      if (fnName === "salvar_nota_cliente") {
        const matchedGroup = grupos.find((g: any) =>
          g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
          args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
        );
        if (matchedGroup) {
          const { error: noteErr } = await supabase.from("client_notes").insert({
            group_id: matchedGroup.group_id,
            content: args.note_content,
            author_name: `Vox (via Alisson)`,
          });
          if (!noteErr) {
            toolResults.push(`✅ Nota salva no card de ${matchedGroup.nome}`);
          } else {
            toolResults.push(`❌ Erro ao salvar nota: ${noteErr.message}`);
          }
        } else {
          toolResults.push(`⚠️ Cliente "${args.group_name}" não encontrado para salvar nota.`);
        }
      }

      // Handle registrar_feedback
      if (fnName === "registrar_feedback") {
        const matchedGroup = args.group_name ? grupos.find((g: any) =>
          g.nome.toLowerCase().includes(args.group_name.toLowerCase())
        ) : null;
        await supabase.from("team_feedback_log").insert({
          member_name: "Alisson Lima",
          message: args.message_summary,
          category: args.category || "geral",
          group_id: matchedGroup?.group_id || null,
          group_name: matchedGroup?.nome || args.group_name || null,
          relevance: args.relevance || "low",
        });
        toolResults.push(`✅ Feedback registrado.`);
      }

      // Handle editar_prompt (ONLY for Alisson)
      if (fnName === "editar_prompt") {
        const { prompt_key, new_value, description_hint } = args;
        // Check if prompt exists
        const { data: existing } = await supabase
          .from("ai_prompts_config")
          .select("id, prompt_label")
          .eq("prompt_key", prompt_key)
          .maybeSingle();

        if (existing) {
          const { error: updateErr } = await supabase
            .from("ai_prompts_config")
            .update({
              prompt_value: new_value,
              updated_at: new Date().toISOString(),
              updated_by: "Alisson Lima (via WhatsApp)",
            })
            .eq("prompt_key", prompt_key);

          if (updateErr) {
            toolResults.push(`❌ Erro ao editar prompt: ${updateErr.message}`);
          } else {
            toolResults.push(`✅ Prompt "${existing.prompt_label}" (${prompt_key}) atualizado com sucesso!`);
          }
        } else {
          // Create new prompt
          const { error: insertErr } = await supabase.from("ai_prompts_config").insert({
            prompt_key,
            prompt_label: description_hint || prompt_key,
            prompt_value: new_value,
            prompt_category: "Geral",
            updated_by: "Alisson Lima (via WhatsApp)",
          });
          if (insertErr) {
            toolResults.push(`❌ Erro ao criar prompt: ${insertErr.message}`);
          } else {
            toolResults.push(`✅ Novo prompt "${prompt_key}" criado com sucesso!`);
          }
        }
      }

      // Handle editar_config_sistema (ONLY for Alisson)
      if (fnName === "editar_config_sistema") {
        const { config_key, new_value } = args;
        // Try to find and update config
        const { data: existing } = await supabase
          .from("system_configs")
          .select("id, config_label")
          .eq("config_key", config_key)
          .maybeSingle();

        if (existing) {
          const { error: updateErr } = await supabase
            .from("system_configs")
            .update({
              config_value: new_value,
              updated_at: new Date().toISOString(),
              updated_by: "Alisson Lima (via WhatsApp)",
            })
            .eq("config_key", config_key);

          if (updateErr) {
            toolResults.push(`❌ Erro ao editar config: ${updateErr.message}`);
          } else {
            toolResults.push(`✅ Configuração "${existing.config_label}" (${config_key}) atualizada para: ${new_value}`);
          }
        } else {
          // List available keys to help
          const { data: allKeys } = await supabase.from("system_configs").select("config_key, config_label").limit(50);
          const keyList = (allKeys || []).map((k: any) => `${k.config_key} (${k.config_label})`).join(", ");
          toolResults.push(`⚠️ Chave "${config_key}" não encontrada. Chaves disponíveis: ${keyList}`);
        }
      }
    }

    // If there were tool calls and we need a follow-up response with results
    if (toolCalls.length > 0 && toolCalls.some((tc: any) => ["criar_pendencia", "remover_pendencias", "criar_tarefa", "remover_tarefas", "enviar_cutucada", "salvar_nota_cliente", "registrar_feedback", "editar_prompt", "editar_config_sistema", "agendar_evento"].includes(tc.function?.name))) {
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

// Map team member names to their gestor_responsavel filter value
// null means "all clients" (owner-level access)
const TEAM_GESTOR_MAP: Record<string, string | null> = {
  "Murillo": "Murilo Araújo",
  "Murilo": "Murilo Araújo",
  "Netto": "Netto Monge",
  "Jader": "Jader Costa",
  "Priscilla": null, // sócia — acesso total
  "Priscila": null,
};

/**
 * Handle team member replies to coach messages — full context-aware agent
 */
async function handleTeamCoachReply(
  messageText: string,
  pushName: string,
  teamWebhook: { name: string; url: string },
  supabase: any
) {
  try {
    // Check for 👍 reaction - mark last coach message as "feito" AND resolve related pending demands
    const trimmed = messageText.trim();
    if (trimmed === "👍" || trimmed === "👍🏻" || trimmed === "👍🏼" || trimmed === "👍🏽" || trimmed === "👍🏾" || trimmed === "👍🏿" || /^(joia|jóia|feito|resolvido|pronto|ok|done|sim|já fiz|ja fiz|já resolvi|ja resolvi)$/i.test(trimmed)) {
      const { data: lastMsg } = await supabase
        .from("coach_messages")
        .select("id, group_id, mensagem")
        .eq("destinatario_nome", teamWebhook.name)
        .eq("enviada", true)
        .is("resultado", null)
        .order("enviada_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMsg) {
        await supabase.from("coach_messages").update({ resultado: "feito" }).eq("id", lastMsg.id);
        console.log(`Marked coach message ${lastMsg.id} as 'feito' for ${teamWebhook.name}`);

        // Also auto-resolve pending demands for the group referenced in the coach message
        if (lastMsg.group_id) {
          await autoResolvePendingDemands(lastMsg.group_id, teamWebhook.name, supabase);
          console.log(`Auto-resolved pending demands for group ${lastMsg.group_id} after ${teamWebhook.name} confirmed with thumbs up`);
        }
      }
      return;
    }

    if (!shouldRespondToMessage(messageText)) return;

    const openaiKey = Deno.env.get("openai");
    const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
    const aiUrl = "https://api.openai.com/v1/chat/completions";
    const aiKey = openaiKey;
    if (!aiKey) return;

    const firstName = teamWebhook.name.split(" ")[0];
    const gestorFilter = TEAM_GESTOR_MAP[teamWebhook.name] ?? TEAM_GESTOR_MAP[firstName] ?? undefined;

    // --- Fetch groups (filtered by role) ---
    let gruposQuery = supabase.from("whatsapp_grupos").select("*").order("nome");
    if (gestorFilter !== null && gestorFilter !== undefined) {
      gruposQuery = gruposQuery.eq("gestor_responsavel", gestorFilter);
    }
    const { data: grupos } = await gruposQuery;
    const allGroups = grupos || [];

    // === DETERMINISTIC ADS RESPONSE (before heavy context loading) ===
    if (META_TOKEN && isExactAdsSpendQuery(messageText)) {
      // For gestors, also check all groups (not just filtered) so they can ask about any client
      const { data: allGrupos } = await supabase.from("whatsapp_grupos").select("*");
      const exactReply = await tryExactAdsReply(messageText, allGrupos || allGroups, META_TOKEN);
      if (exactReply) {
        console.log(`Deterministic ads reply for ${firstName}:`, exactReply.substring(0, 80));
        const encodedReply = encodeURIComponent(exactReply);
        await fetch(`${teamWebhook.url}?message=${encodedReply}`);
        return;
      }
    }

    // --- Fetch recent messages, pending, ads in parallel ---
    const groupIds = allGroups.map((g: any) => g.group_id);

    const conversasPromises = groupIds.map((gid: string) =>
      supabase
        .from("whatsapp_conversas")
        .select("group_id, nome_contato, mensagem, recebido_em, direcao")
        .eq("group_id", gid)
        .order("recebido_em", { ascending: false })
        .limit(30)
    );

    const pendingPromise = supabase
      .from("pending_demand_resolutions")
      .select("*")
      .eq("resolved", false);

    const recentCoachPromise = supabase
      .from("coach_messages")
      .select("mensagem, tipo, created_at, destinatario_nome")
      .eq("destinatario_nome", teamWebhook.name)
      .eq("enviada", true)
      .order("created_at", { ascending: false })
      .limit(10);

    const [pendingResult, coachResult, ...conversasResults] = await Promise.all([
      pendingPromise,
      recentCoachPromise,
      ...conversasPromises,
    ]);

    const pendingResolutions = pendingResult.data || [];
    const recentCoach = coachResult.data || [];

    const groupMsgsMap = new Map<string, any[]>();
    for (let i = 0; i < groupIds.length; i++) {
      groupMsgsMap.set(groupIds[i], conversasResults[i].data || []);
    }

    // Pending by group (filter to relevant groups)
    const pendingByGroup = new Map<string, any[]>();
    const groupIdSet = new Set(groupIds);
    for (const p of pendingResolutions) {
      if (!groupIdSet.has(p.group_id)) continue;
      if (!pendingByGroup.has(p.group_id)) pendingByGroup.set(p.group_id, []);
      pendingByGroup.get(p.group_id)!.push(p);
    }

    // Ads data (30d + today)
    const adsDataMap = new Map<string, any>();
    const adsTodayMapTeam = new Map<string, any>();
    const todayStrTeam = new Date().toISOString().slice(0, 10);
    const groupsWithAds = allGroups.filter((g: any) => g.ad_account_id);

    const detectedRangeTeam = detectDateRangeInfo(messageText);
    const adsCustomRangeMapTeam = new Map<string, any>();

    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        const fetches: Promise<any>[] = [
          fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN),
          fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN, undefined, todayStrTeam, todayStrTeam),
        ];
        if (detectedRangeTeam) {
          fetches.push(fetchMetaAdsForAccount(g.ad_account_id, META_TOKEN, undefined, detectedRangeTeam.since, detectedRangeTeam.until));
        }
        const results = await Promise.all(fetches);
        if (results[0]) adsDataMap.set(g.group_id, results[0]);
        if (results[1]) adsTodayMapTeam.set(g.group_id, results[1]);
        if (detectedRangeTeam && results[2]) adsCustomRangeMapTeam.set(g.group_id, results[2]);
      });
      await Promise.all(adsPromises);
    }

    // --- Build enriched context ---
    const contextLines: string[] = [];
    for (const g of allGroups) {
      const gid = g.group_id;
      const msgs = groupMsgsMap.get(gid) || [];
      const clientMsgs = msgs.filter((m: any) => m.direcao === "entrada");
      const teamMsgs = msgs.filter((m: any) => m.direcao === "saida");

      let mesesCliente = "";
      if (g.data_entrada) {
        const months = Math.floor((Date.now() - new Date(g.data_entrada).getTime()) / (1000 * 60 * 60 * 24 * 30));
        mesesCliente = `${months} meses`;
      }

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
      const frtMin = frtSamples.length ? Math.round(frtSamples.reduce((a, b) => a + b, 0) / frtSamples.length) : null;

      const lastMsg = msgs[0];
      const daysInactive = lastMsg ? Math.floor((Date.now() - new Date(lastMsg.recebido_em).getTime()) / (1000 * 60 * 60 * 24)) : null;
      const groupPending = pendingByGroup.get(gid) || [];
      const ads = adsDataMap.get(gid);
      const adsToday = adsTodayMapTeam.get(gid);

      let line = `### ${g.nome}`;
      line += `\n  Responsável: ${g.gestor_responsavel || "N/A"} | Plano: ${g.plano || "N/A"} | Investimento: ${g.investimento_ads ? `R$${g.investimento_ads}` : "N/A"}`;
      if (g.acessos_cliente) line += `\n  🔑 Acessos: ${g.acessos_cliente}`;
      if (g.data_entrada) line += ` | Cliente há ${mesesCliente}`;
      line += `\n  Msgs recentes: ${msgs.length} (${clientMsgs.length} cliente, ${teamMsgs.length} equipe)`;
      if (frtMin !== null) line += ` | FRT: ${frtMin}min`;
      if (daysInactive !== null) line += ` | Última atividade: ${daysInactive === 0 ? "hoje" : `${daysInactive}d atrás`}`;
      if (groupPending.length > 0) {
        line += `\n  ⚠️ ${groupPending.length} pendência(s): ${groupPending.slice(0, 3).map((p: any) => `"${p.term}"`).join(", ")}`;
      }
      if (adsToday) {
        line += `\n  📊 Ads HOJE: R$${adsToday.spend.toFixed(2)} gasto, ${adsToday.clicks} cliques, ${adsToday.leads} leads`;
      }
      const adsCustomTeam = adsCustomRangeMapTeam.get(gid);
      if (adsCustomTeam && detectedRangeTeam) {
        line += `\n  📊 Ads (${detectedRangeTeam.since} a ${detectedRangeTeam.until}): R$${adsCustomTeam.spend.toFixed(2)} gasto, ${adsCustomTeam.clicks} cliques, ${adsCustomTeam.leads} leads${adsCustomTeam.cpa ? `, CPA R$${adsCustomTeam.cpa.toFixed(2)}` : ""}`;
      }
      if (ads) {
        line += `\n  📊 Ads 30d: R$${ads.spend.toFixed(0)} gasto, ${ads.leads} leads, ${ads.cpa ? `CPA R$${ads.cpa.toFixed(2)}` : ""}, CTR ${ads.ctr.toFixed(2)}%`;
      }

      const last5 = msgs.slice(0, 5).reverse();
      if (last5.length > 0) {
        line += `\n  Últimas msgs:`;
        for (const m of last5) {
          const dir = m.direcao === "entrada" ? "👤" : "👨‍💼";
          line += `\n    ${dir} ${m.nome_contato || "?"}: ${(m.mensagem || "").slice(0, 80)}`;
        }
      }
      contextLines.push(line);
    }

    const coachContext = recentCoach
      .map((m: any) => `[Coach → ${firstName}]: ${m.mensagem}`)
      .reverse()
      .join("\n");

    const accessScope = gestorFilter === null || gestorFilter === undefined
      ? "todos os clientes da agência (acesso total como sócia/proprietária)"
      : `seus clientes como gestor(a) (${allGroups.length} clientes)`;

    // Priscilla (sócia) gets full agent capabilities like Alisson
    const isOwner = firstName.toLowerCase().startsWith("prisc");

    // Fetch recent team feedback for this member for context
    const { data: recentFeedback } = await supabase
      .from("team_feedback_log")
      .select("message, category, group_name, created_at")
      .eq("member_name", teamWebhook.name)
      .order("created_at", { ascending: false })
      .limit(10);

    const feedbackContext = (recentFeedback || [])
      .map((f: any) => `[${f.created_at?.slice(0, 10)}] ${f.category}: ${f.message}${f.group_name ? ` (${f.group_name})` : ""}`)
      .reverse()
      .join("\n");

    let toolsPromptSection = `
CAPACIDADES DE REGISTRO (use SEMPRE que aplicável):
- Quando ${firstName} mencionar algo que FEZ para um cliente (subiu campanha, ajustou anúncio, fez reunião, resolveu problema, criou arte, etc.), use "salvar_nota_cliente" para registrar no card do cliente
- ${firstName} também pode PEDIR para adicionar uma nota específica em um card de cliente — use "salvar_nota_cliente"
- IMPORTANTE: ${firstName} só pode adicionar notas nos cards dos SEUS clientes (os que aparecem nos dados). Se pedir para adicionar nota em um cliente que não é dele(a), informe que não tem permissão.
- Quando ${firstName} compartilhar informações gerais sobre o dia, contexto de trabalho, ou insights, use "registrar_feedback" para armazenar o contexto
- Você pode usar AMBAS as ferramentas na mesma resposta se necessário
- SEMPRE confirme o que registrou na resposta de forma natural`;

    if (isOwner) {
      toolsPromptSection += `
- Você pode CRIAR pendências e tarefas para qualquer membro da equipe quando ${firstName} pedir
- Você pode REMOVER pendências e tarefas do quadro quando ${firstName} pedir
- Você pode ENVIAR CUTUCADAS (nudges) para qualquer membro da equipe quando ${firstName} pedir — use "enviar_cutucada"
- Se faltar informação, pergunte antes de agir
- Se ${firstName} der um COMANDO operacional (criar, remover, excluir, apagar, cutucar, cutucada, lembrar, cobrar), EXECUTE usando as ferramentas disponíveis`;
    } else {
      toolsPromptSection += `
- ${firstName} pode RESOLVER pendências dos seus clientes — quando disser que resolveu/fez/completou algo, use "resolver_pendencia"
- ${firstName} pode CRIAR tarefas para si mesmo ou solicitar tarefas — use "criar_tarefa". SEMPRE identifique o cliente mencionado e use o nome completo do grupo como título, com a ação na descrição.
- ${firstName} pode AGENDAR eventos/reuniões/compromissos na agenda — use "agendar_evento" (NÃO use criar_tarefa para compromissos com data/hora).
- Se ${firstName} perguntar sobre algum cliente, grupo, ads, pendência, responda com os dados que você tem
- IMPORTANTE: Se ${firstName} confirmar que resolveu/fez/tratou uma pendência (mesmo com "joia", "feito", "já resolvi"), SEMPRE use resolver_pendencia para marcar como feito no sistema`;
    }

    const systemPrompt = `Você é a Vox, analista sênior de CS e assistente pessoal da equipe da agência New Vox. Está conversando com ${firstName} da equipe via WhatsApp. Você é uma colega de trabalho inteligente, prestativa e proativa.

EQUIPE NEW VOX:
- Jader Costa: Gestor de tráfego
- Murilo Araújo (Murillo): Gestor de tráfego / Gerente
- Netto Monge: Gestor de tráfego
- Priscilla Borges: Social media e sócia da empresa
- Alisson Lima: Sócio proprietário
- Joel: Gerente geral
- Thais: Auxiliar de social media
- Victor Botto: Design gráfico
- Jiza Reis: Financeiro
${toolsPromptSection}

REGRAS:
- Tom: colega de trabalho gente boa, profissional, direto, informal
- Respostas concisas (máx 500 caracteres) mas completas
- Use emojis com moderação
- Responda em português brasileiro natural
- ${firstName} tem acesso a ${accessScope}
- Responda QUALQUER pergunta que ${firstName} fizer sobre os clientes, operação, dados, etc. Seja útil!
- CONSULTA DE ACESSOS: Quando ${firstName} perguntar sobre acessos, login, senha, credenciais, hospedagem ou domínio de um cliente, verifique o campo "Acessos" nos dados do grupo. Se a informação existir, envie IMEDIATAMENTE e completa. Se não existir, diga que o campo está vazio e sugira preencher na aba Informações do card do cliente.
- Se ${firstName} perguntar "algum outro grupo?" ou algo similar, entenda como "tem algum grupo/cliente que precisa de atenção?" e responda com dados reais
- Quando ${firstName} contar como foi o dia ou o que fez, REGISTRE usando as ferramentas e RESPONDA de forma encorajadora
- IMPORTANTE: Quando houver dados de Meta Ads para um PERÍODO ESPECÍFICO, use EXATAMENTE esses valores
- Formate para WhatsApp (texto simples, sem markdown complexo, use * para negrito)

CONTEXTO DOS CLIENTES:
${contextLines.join("\n\n") || "Nenhum cliente encontrado."}

CUTUCADAS RECENTES ENVIADAS:
${coachContext || "Nenhuma cutucada recente."}

HISTÓRICO DE FEEDBACK DE ${firstName.toUpperCase()}:
${feedbackContext || "Nenhum feedback anterior registrado."}`;

    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: messageText },
    ];

    const requestBody: any = {
      model: "gpt-4o-mini",
      messages: aiMessages,
      max_tokens: 1500,
      tools: isOwner ? AGENT_TOOLS : [...FEEDBACK_TOOLS, AGENT_TOOLS.find((t: any) => t.function.name === "criar_tarefa")!, AGENT_TOOLS.find((t: any) => t.function.name === "perguntar_detalhes")!, AGENT_TOOLS.find((t: any) => t.function.name === "resolver_pendencia")!, AGENT_TOOLS.find((t: any) => t.function.name === "agendar_evento")!],
    };

    let aiData: any = null;

    const aiResp = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (aiResp.ok) {
      aiData = await aiResp.json();
    } else {
      const errText = await aiResp.text();
      console.error("AI error for team reply:", errText);
      // Retry not possible - OpenAI is the only provider
      return;
    }

    const choice = aiData?.choices?.[0];
    if (!choice) return;

    let reply = choice.message?.content?.trim() || "";
    const toolCalls = choice.message?.tool_calls || [];

    // Process tool calls for all team members
    if (toolCalls.length > 0) {
      const toolResults: string[] = [];
      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        const args = JSON.parse(tc.function?.arguments || "{}");
        console.log(`Tool call from ${firstName}: ${fnName}`, JSON.stringify(args));

        if (fnName === "criar_pendencia") {
          const matchedGroup = allGroups.find((g: any) =>
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
            toolResults.push(insertErr ? `❌ Erro: ${insertErr.message}` : `✅ Pendência criada: "${args.term}" para ${args.responsible} no cliente ${matchedGroup.nome}`);
          } else {
            toolResults.push(`❌ Cliente "${args.group_name}" não encontrado.`);
          }
        }

        if (fnName === "remover_pendencias") {
          const responsibles = Array.isArray(args.responsibles) ? args.responsibles.filter(Boolean) : [];
          const normalizedStatus = args.status === "todos" ? null : (args.status || "pendente");
          let groupIds2: string[] | null = null;
          if (args.group_name) {
            groupIds2 = allGroups.filter((g: any) => g.nome.toLowerCase().includes(args.group_name.toLowerCase())).map((g: any) => g.group_id);
          }
          const { data: existing } = await supabase.from("pending_demand_resolutions").select("id, term, group_id, status");
          const idsToDelete = (existing || []).filter((item: any) => {
            const term = (item.term || "").toLowerCase();
            const responsibleMatch = responsibles.length === 0 || responsibles.some((name: string) => term.includes(name.toLowerCase()));
            const statusMatch = !normalizedStatus || item.status === normalizedStatus;
            const groupMatch = !groupIds2 || groupIds2.includes(item.group_id);
            return responsibleMatch && statusMatch && groupMatch;
          }).map((item: any) => item.id);
          if (idsToDelete.length === 0) {
            toolResults.push(`⚠️ Nenhuma pendência encontrada para remover.`);
          } else {
            const { error: deleteErr } = await supabase.from("pending_demand_resolutions").delete().in("id", idsToDelete);
            toolResults.push(deleteErr ? `❌ Erro: ${deleteErr.message}` : `✅ ${idsToDelete.length} pendência(s) removida(s).`);
          }
        }

        if (fnName === "criar_tarefa") {
          let matchedGroupId: string | null = null;
          let matchedGroupName: string | null = null;
          if (args.group_name) {
            const searchTerm = args.group_name.toLowerCase().trim();
            const mg = allGroups.find((g: any) => {
              const nome = g.nome.toLowerCase();
              const nomeClean = nome.replace(/nv[-\s]*mkt\s*/g, "").replace(/mkt\s*nv[-\s]*/g, "").replace(/nv[-\s]*/g, "").trim();
              return nome.includes(searchTerm) || searchTerm.includes(nomeClean) || nomeClean.includes(searchTerm) ||
                searchTerm.split(/\s+/).every((w: string) => nome.includes(w));
            });
            matchedGroupId = mg?.group_id || null;
            matchedGroupName = mg?.nome || null;
          }
          const taskTitle = matchedGroupName || args.title;
          const { error: insertErr } = await supabase.from("tasks").insert({
            title: taskTitle,
            description: args.description || null,
            assigned_to: args.assigned_to,
            group_id: matchedGroupId,
            priority: args.priority || "normal",
            due_date: args.due_date || null,
            created_by: `${firstName} (via WhatsApp)`,
            status: "pendente",
          });
          toolResults.push(insertErr ? `❌ Erro: ${insertErr.message}` : `✅ Tarefa criada: "${taskTitle}" para ${args.assigned_to}\n📝 ${args.description || ""}`);
        }

        if (fnName === "remover_tarefas") {
          const responsibles = Array.isArray(args.responsibles) ? args.responsibles.filter(Boolean) : [];
          const normalizedStatus = args.status === "todos" ? null : (args.status || "pendente");
          const { data: existing } = await supabase.from("tasks").select("id, assigned_to, status, group_id");
          const idsToDelete = (existing || []).filter((item: any) => {
            const assigned = (item.assigned_to || "").toLowerCase();
            const responsibleMatch = responsibles.length === 0 || responsibles.some((name: string) => assigned.includes(name.toLowerCase()));
            const statusMatch = !normalizedStatus || item.status === normalizedStatus;
            return responsibleMatch && statusMatch;
          }).map((item: any) => item.id);
          if (idsToDelete.length === 0) {
            toolResults.push(`⚠️ Nenhuma tarefa encontrada para remover.`);
          } else {
            const { error: deleteErr } = await supabase.from("tasks").delete().in("id", idsToDelete);
            toolResults.push(deleteErr ? `❌ Erro: ${deleteErr.message}` : `✅ ${idsToDelete.length} tarefa(s) removida(s).`);
          }
        }

        if (fnName === "agendar_evento") {
          let matchedGroupId: string | null = null;
          if (args.group_name) {
            const searchTerm = args.group_name.toLowerCase().trim();
            const mg = allGroups.find((g: any) => {
              const nome = g.nome.toLowerCase();
              const nomeClean = nome.replace(/nv[-\s]*mkt\s*/g, "").replace(/mkt\s*nv[-\s]*/g, "").replace(/nv[-\s]*/g, "").trim();
              return nome.includes(searchTerm) || searchTerm.includes(nomeClean) || nomeClean.includes(searchTerm);
            });
            matchedGroupId = mg?.group_id || null;
          }
          const startTime = args.start_time || new Date().toISOString();
          const endTime = args.end_time || new Date(new Date(startTime).getTime() + 3600000).toISOString();
          const participants = Array.isArray(args.participants) ? args.participants : [];
          const { error: insertErr } = await supabase.from("calendar_events").insert({
            title: args.title,
            description: args.description || null,
            start_time: startTime,
            end_time: endTime,
            participants: participants,
            group_id: matchedGroupId,
            event_type: args.event_type || "reuniao",
            location: args.location || null,
            created_by: `${firstName} (via WhatsApp)`,
          });
          if (insertErr) {
            toolResults.push(`❌ Erro ao agendar: ${insertErr.message}`);
          } else {
            const dateStr = new Date(startTime).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
            toolResults.push(`✅ Evento agendado: "${args.title}" em ${dateStr}${participants.length ? ` com ${participants.join(", ")}` : ""}`);
          }
        }

        if (fnName === "perguntar_detalhes") {
          reply = args.question;
        }

        if (fnName === "enviar_cutucada") {
          const targetName = args.destinatario;
          const targetWebhookUrl = Object.entries(TEAM_WEBHOOK_MAP).find(([key]) =>
            targetName.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(targetName.toLowerCase().split(" ")[0])
          )?.[1];

          if (!targetWebhookUrl) {
            toolResults.push(`❌ Não encontrei webhook para "${targetName}".`);
          } else {
            let matchedGroup: any = null;
            if (args.group_name) {
              matchedGroup = allGroups.find((g: any) =>
                g.nome.toLowerCase().includes(args.group_name.toLowerCase())
              );
            }

            const targetFirstName = targetName.split(" ")[0];
            let cutucadaMsg = "";
            try {
              const coachResp = await fetch(aiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aiKey}` },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: `Você é a Vox, coach de CS. Gere uma cutucada curta para ${targetFirstName}. Tom amigável. Máx 300 chars. Termine com "(responda 👍 se já fez)".` },
                    { role: "user", content: `Cutucada: ${args.mensagem_contexto}${matchedGroup ? ` (cliente: ${matchedGroup.nome})` : ""}` },
                  ],
                  max_tokens: 200,
                }),
              });
              if (coachResp.ok) {
                const coachData = await coachResp.json();
                cutucadaMsg = coachData.choices?.[0]?.message?.content?.trim() || "";
              }
            } catch (e) {
              console.error("Error generating cutucada:", e);
            }

            if (!cutucadaMsg) {
              cutucadaMsg = `E aí ${targetFirstName}! 👋 ${args.mensagem_contexto}. Bora resolver? (responda 👍 se já fez)`;
            }

            try {
              const encodedMsg = encodeURIComponent(cutucadaMsg);
              await fetch(`${targetWebhookUrl}?message=${encodedMsg}`);
              await supabase.from("coach_messages").insert({
                destinatario_nome: targetName,
                mensagem: cutucadaMsg,
                tipo: args.tipo || "geral",
                group_id: matchedGroup?.group_id || null,
                enviada: true,
                enviada_em: new Date().toISOString(),
              });
              toolResults.push(`✅ Cutucada enviada para ${targetName}!`);
            } catch (e) {
              toolResults.push(`❌ Erro ao enviar cutucada para ${targetName}`);
            }
          }
        }

        // Handle salvar_nota_cliente
        if (fnName === "salvar_nota_cliente") {
          const matchedGroup = allGroups.find((g: any) =>
            g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
            args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
          );
          if (matchedGroup) {
            const { error: noteErr } = await supabase.from("client_notes").insert({
              group_id: matchedGroup.group_id,
              content: args.note_content,
              author_name: `Vox (via ${firstName})`,
            });
            toolResults.push(noteErr ? `❌ Erro ao salvar nota: ${noteErr.message}` : `✅ Nota salva no card de ${matchedGroup.nome}`);
          } else {
            toolResults.push(`⚠️ Cliente "${args.group_name}" não encontrado para salvar nota.`);
          }
        }

        // Handle registrar_feedback
        if (fnName === "registrar_feedback") {
          const matchedGroup = args.group_name ? allGroups.find((g: any) =>
            g.nome.toLowerCase().includes(args.group_name.toLowerCase())
          ) : null;
          await supabase.from("team_feedback_log").insert({
            member_name: teamWebhook.name,
            message: args.message_summary,
            category: args.category || "geral",
            group_id: matchedGroup?.group_id || null,
            group_name: matchedGroup?.nome || args.group_name || null,
            relevance: args.relevance || "low",
          });
          toolResults.push(`✅ Feedback registrado.`);
        }

        // Handle resolver_pendencia
        if (fnName === "resolver_pendencia") {
          const matchedGroup = allGroups.find((g: any) =>
            g.nome.toLowerCase().includes(args.group_name.toLowerCase()) ||
            args.group_name.toLowerCase().includes(g.nome.toLowerCase().replace("nv-mkt ", "").replace("nv - ", "").replace("mkt nv - ", "").replace("nv ", ""))
          );
          if (matchedGroup) {
            let query = supabase
              .from("pending_demand_resolutions")
              .select("id, term")
              .eq("group_id", matchedGroup.group_id)
              .eq("resolved", false);

            const { data: unresolvedDemands } = await query;

            if (!unresolvedDemands || unresolvedDemands.length === 0) {
              toolResults.push(`⚠️ Não encontrei pendências abertas para ${matchedGroup.nome}.`);
            } else {
              // If term_hint provided, try to match specific demand
              let toResolve = unresolvedDemands;
              if (args.term_hint) {
                const hint = args.term_hint.toLowerCase();
                const filtered = unresolvedDemands.filter((d: any) => d.term.toLowerCase().includes(hint));
                if (filtered.length > 0) toResolve = filtered;
              }

              const profileName = matchTeamProfileName(teamWebhook.name);
              let resolvedByUserId: string | null = null;
              if (profileName) {
                const { data: profile } = await supabase.from("profiles").select("user_id").eq("full_name", profileName).maybeSingle();
                if (profile) resolvedByUserId = profile.user_id;
              }

              const ids = toResolve.map((d: any) => d.id);
              const { error: resolveErr } = await supabase
                .from("pending_demand_resolutions")
                .update({
                  resolved: true,
                  status: "feito",
                  resolved_at: new Date().toISOString(),
                  resolved_by: resolvedByUserId,
                })
                .in("id", ids);

              if (resolveErr) {
                toolResults.push(`❌ Erro ao resolver: ${resolveErr.message}`);
              } else {
                const terms = toResolve.map((d: any) => `"${d.term}"`).join(", ");
                toolResults.push(`✅ ${toResolve.length} pendência(s) resolvida(s) de ${matchedGroup.nome}: ${terms}`);
              }
            }
          } else {
            toolResults.push(`❌ Cliente "${args.group_name}" não encontrado.`);
          }
        }
      }

      // Follow-up with tool results
      if (toolCalls.some((tc: any) => ["criar_pendencia", "remover_pendencias", "criar_tarefa", "remover_tarefas", "enviar_cutucada", "salvar_nota_cliente", "registrar_feedback", "resolver_pendencia", "agendar_evento"].includes(tc.function?.name))) {
        const toolResultMessages = toolCalls.map((tc: any, i: number) => ({
          role: "tool",
          tool_call_id: tc.id,
          content: toolResults[i] || "OK",
        }));
        // Use OpenAI for follow-up if primary failed (detected by requestBody.model being gpt-4o-mini from fallback)
        const followUp = await fetch(aiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [...aiMessages, choice.message, ...toolResultMessages],
            max_tokens: 500,
          }),
        });
        if (followUp.ok) {
          const followUpData = await followUp.json();
          reply = followUpData.choices?.[0]?.message?.content?.trim() || toolResults.join("\n");
        } else {
          reply = toolResults.join("\n");
        }
      }
    }

    if (!reply) return;

    // Send reply via webhook (GET)
    const encodedReply = encodeURIComponent(reply);
    const sendResp = await fetch(`${teamWebhook.url}?message=${encodedReply}`);
    console.log(`Coach reply to ${firstName}: ${sendResp.status}`);
  } catch (err) {
    console.error("Error in team coach reply:", err);
  }
}
// Map team member contact names to profile full_name for resolved_by attribution
const TEAM_NAME_TO_PROFILE: Record<string, string> = {
  "murilo": "Murillo",
  "murillo": "Murillo",
  "netto": "Netto",
  "jader": "Jader",
  "priscila": "Priscilla",
  "priscilla": "Priscilla",
  "alisson": "Alisson",
  "thais": "Thais",
  "jiza": "Jiza",
  "victor": "Victor",
};

function matchTeamProfileName(contactName: string): string | null {
  const normalized = normalizeName(contactName);
  for (const [key, profileName] of Object.entries(TEAM_NAME_TO_PROFILE)) {
    if (normalized.includes(key)) return profileName;
  }
  return null;
}

async function autoResolvePendingDemands(groupId: string, contactName: string, supabase: any) {
  try {
    // Find unresolved pending demands for this group
    const { data: unresolvedDemands, error } = await supabase
      .from("pending_demand_resolutions")
      .select("id, term")
      .eq("group_id", groupId)
      .eq("resolved", false);

    if (error || !unresolvedDemands || unresolvedDemands.length === 0) return;

    // Find the profile user_id for this team member
    const profileName = matchTeamProfileName(contactName);
    let resolvedByUserId: string | null = null;

    if (profileName) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("full_name", profileName)
        .maybeSingle();
      if (profile) resolvedByUserId = profile.user_id;
    }

    // Auto-resolve all pending demands for this group
    const updateData: any = {
      resolved: true,
      status: "feito",
      resolved_at: new Date().toISOString(),
    };
    if (resolvedByUserId) {
      updateData.resolved_by = resolvedByUserId;
    }

    const ids = unresolvedDemands.map((d: any) => d.id);
    const { error: updateError } = await supabase
      .from("pending_demand_resolutions")
      .update(updateData)
      .in("id", ids);

    if (updateError) {
      console.error("Error auto-resolving demands:", updateError);
    } else {
      console.log(`Auto-resolved ${ids.length} pending demand(s) for group ${groupId} by ${contactName} (profile: ${profileName || "unknown"}, user_id: ${resolvedByUserId || "none"})`);
    }
  } catch (err) {
    console.error("autoResolvePendingDemands error:", err);
  }
}


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

// Grupos permitidos — loaded from DB at request time, with hardcoded fallback
const HARDCODED_GROUPS: Record<string, string> = {
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
  "120363423095337077@g.us": "NV - T3 LED",
  "120363426488293045@g.us": "NV - MKT IMPLANTAR RIO VERDE",
  "120363404804672868@g.us": "NV - MKT ODONTONEO",
  "120363405316956579@g.us": "NV - Guardião e agilidade de tráfego",
  "120363406017903305@g.us": "NV - Bass Importados",
  "120363164345677060@g.us": "NV - ALINHAR SAÚDE MKT",
  "120363284265212402@g.us": "NV - MKT IDONEA CONTABILIDADE",
  "120363142410397893@g.us": "NV - ASSESSORIA DE TRAFEGO ELETROSOLDA",
  "120363420585618479@g.us": "NV - Cabana do lago",
  "120363424696043704@g.us": "NV-MKT Belo Odonto🦷",
};

// Dynamic whitelist: combines hardcoded + DB-registered groups
let ALLOWED_GROUPS: Record<string, string> = { ...HARDCODED_GROUPS };

async function loadAllowedGroupsFromDB(supabase: any): Promise<void> {
  try {
    const { data: dbGroups } = await supabase
      .from("whatsapp_grupos")
      .select("group_id, nome");
    if (dbGroups && dbGroups.length > 0) {
      // Merge DB groups into allowed list (DB takes precedence)
      for (const g of dbGroups) {
        if (g.group_id && !ALLOWED_GROUPS[g.group_id]) {
          ALLOWED_GROUPS[g.group_id] = g.nome;
        }
      }
    }
    console.log(`Allowed groups loaded: ${Object.keys(ALLOWED_GROUPS).length} total`);
  } catch (err) {
    console.error("Error loading groups from DB:", err);
  }
}

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

    // Load dynamic whitelist from DB (merges with hardcoded)
    await loadAllowedGroupsFromDB(supabase);

    const body = await req.json();
    console.log("Webhook received, event:", body.event, "| has data:", !!body.data);

    // ===== EVOLUTION API FORMAT =====
    if (body.event === "messages.upsert" && body.data) {
      const data = body.data;
      const key = data.key || {};
      const remoteJid = key.remoteJid || "";
      const groupNameFromWebhook = data.groupName || "";

      // Smart Matching: If we have a group name but no allowed ID yet, 
      // check if there's a registered group with a matching name but no ID or a placeholder ID
      if (remoteJid.endsWith("@g.us") && groupNameFromWebhook) {
        const { data: matchedGroups } = await supabase
          .from("whatsapp_grupos")
          .select("id, nome, group_id")
          .or(`group_id.eq.${remoteJid},nome.eq.${groupNameFromWebhook}`);
        
        if (matchedGroups && matchedGroups.length > 0) {
          const exactIdMatch = matchedGroups.find((g: any) => g.group_id === remoteJid);
          const nameMatchOnly = matchedGroups.find((g: any) => g.nome === groupNameFromWebhook && (!g.group_id || g.group_id.includes("placeholder")));
          
          if (!exactIdMatch && nameMatchOnly) {
            console.log(`Smart-linking group "${groupNameFromWebhook}" to ID ${remoteJid}`);
            await supabase
              .from("whatsapp_grupos")
              .update({ group_id: remoteJid })
              .eq("id", nameMatchOnly.id);
            
            // Update local cache
            ALLOWED_GROUPS[remoteJid] = groupNameFromWebhook;
          }
        }
      }

      console.log("Processing message, remoteJid:", remoteJid, "| fromMe:", key.fromMe, "| pushName:", data.pushName);

      // Extract phone early to check if it's Alisson
      const isGroup = isGroupJid(remoteJid);
      const earlyPhone = isGroup
        ? (key.participant ? extractPhoneFromJid(key.participant) : null)
        : extractPhoneFromJid(remoteJid);
      const isAlisson = isKnownPhone(earlyPhone, ALISSON_PHONES);
      console.log("isGroup:", isGroup, "| earlyPhone:", earlyPhone, "| isAlisson:", isAlisson, "| isAllowedGroup:", isGroup && isAllowedGroup(remoteJid));

      // Check if it's a team member (for coach replies in DMs)
      const teamWebhook = !isGroup ? findTeamWebhookByName(data.pushName || "") : null;
      const isTeamMember = !!teamWebhook;

      // Allow Alisson's messages and team member DMs through even from non-whitelisted groups/DMs
      if (!isAlisson && !isTeamMember && (!isGroup || !isAllowedGroup(remoteJid))) {
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

      // ===== AUTO-RESOLVE PENDING DEMANDS WHEN TEAM RESPONDS IN GROUP =====
      if (isAllowedSource && direction === "saida" && groupId) {
        autoResolvePendingDemands(groupId, contactName, supabase).catch((err) =>
          console.error("Auto-resolve pending demands error:", err)
        );
      }

      console.log("Phone:", phone, "| isAlisson:", isAlisson, "| isTeamMember:", isTeamMember, "| Message:", messageText?.substring(0, 50));
      if (isAlisson && messageText && shouldRespondToMessage(messageText)) {
        console.log("Alisson message detected, triggering AI reply...");
        handleAlissonAIReply(messageText, groupId, supabase).catch((err) =>
          console.error("Alisson AI reply error:", err)
        );
      }

      // ===== TEAM MEMBER COACH REPLY =====
      if (!isAlisson && isTeamMember && teamWebhook && messageText && !isGroup) {
        console.log(`Team member ${teamWebhook.name} replied: ${messageText.substring(0, 50)}`);
        handleTeamCoachReply(messageText, data.pushName || "", teamWebhook, supabase).catch((err) =>
          console.error("Team coach reply error:", err)
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
