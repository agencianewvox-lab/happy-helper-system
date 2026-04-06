import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function fetchMetaAdsForAccount(accountId: string, token: string, since?: string, until?: string): Promise<any | null> {
  try {
    const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const fields = "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,reach,frequency";
    let dateFilter = "&date_preset=last_30d";
    if (since && until) {
      dateFilter = `&time_range={"since":"${since}","until":"${until}"}`;
    }
    const url = `${META_BASE}/${actId}/insights?fields=${fields}${dateFilter}&access_token=${token}`;
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
      date_range: since && until ? `${since} a ${until}` : "últimos 30 dias",
    };
  } catch (e) {
    console.error("Meta Ads fetch error for", accountId, e);
    return null;
  }
}

function getSafeMessages(messages: any[]): any[] {
  return Array.isArray(messages) ? messages : [];
}

function getLastUserMessage(messages: any[]): any | null {
  const lastUser = [...getSafeMessages(messages)].reverse().find((m: any) => m.role === "user");
  return lastUser || null;
}

function detectSchedulingIntent(messages: any[]): boolean {
  const lastUser = getLastUserMessage(messages);
  if (!lastUser) return false;
  const text = lastUser.content.toLowerCase();
  const keywords = ["agendar", "agenda", "marcar reunião", "marcar uma reunião", "reunião com", "compromisso", "disponibilidade", "horário livre", "agende", "marca"];
  return keywords.some(k => text.includes(k));
}

function detectTaskIntent(messages: any[]): boolean {
  const lastUser = getLastUserMessage(messages);
  if (!lastUser) return false;
  const text = lastUser.content.toLowerCase();
  const keywords = [
    "criar tarefa", "crie uma tarefa", "cria uma tarefa", "nova tarefa", "tarefa para",
    "deixa uma tarefa", "deixe uma tarefa", "colocar tarefa", "coloca tarefa",
    "adicionar tarefa", "adicione tarefa", "fazer tarefa", "faça uma tarefa",
    "tarefa a fazer", "tarefa pra", "task para", "to do para", "todo para",
    "delegar tarefa", "delegue tarefa", "passa uma tarefa", "passe uma tarefa",
    "designar tarefa", "designe tarefa", "atribuir tarefa", "atribua tarefa",
  ];
  return keywords.some(k => text.includes(k));
}
function detectCutucadaIntent(messages: any[]): boolean {
  const lastUser = getLastUserMessage(messages);
  if (!lastUser) return false;
  const text = lastUser.content.toLowerCase();
  const keywords = [
    "cutucada", "cutucar", "enviar cutucada", "envia cutucada", "manda cutucada",
    "cobrar", "lembrar o", "lembra o", "cobra o", "cobra a",
    "manda um lembrete", "envia um lembrete", "nudge",
    "cutuca o", "cutuca a", "dá uma cutucada",
  ];
  return keywords.some(k => text.includes(k));
}

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

function detectDateRangeInfoFromText(text: string): DateRangeInfo | null {
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

function detectDateRangeInfoFromMessages(messages: any[]): DateRangeInfo | null {
  const lastUser = getLastUserMessage(messages);
  if (!lastUser) return null;
  return detectDateRangeInfoFromText(lastUser.content);
}

function detectDateRangeFromMessages(messages: any[]): { since: string; until: string } | null {
  const info = detectDateRangeInfoFromMessages(messages);
  return info ? { since: info.since, until: info.until } : null;
}

function detectComplexQuery(messages: any[]): boolean {
  const lastUser = getLastUserMessage(messages);
  if (!lastUser) return false;
  const text = lastUser.content.toLowerCase();
  const complexKeywords = [
    "comparar", "comparação", "todos os grupos", "análise geral", "visão geral",
    "panorama", "ranking", "equipe", "performance da equipe", "tendência",
    "evolução", "upsell", "oportunidades", "quem posso", "investimento",
    "gasto", "meta ads", "ads", "período", "periodo", "valor", "quanto",
  ];
  return complexKeywords.some(k => text.includes(k));
}

function detectExactAdsSpendQuery(messages: any[]): boolean {
  const lastUser = getLastUserMessage(messages);
  if (!lastUser) return false;
  const text = lastUser.content.toLowerCase();
  const hasAdsIntent = ["investimento", "gasto", "gastou", "valor investido", "valor", "quanto", "quanto foi", "total", "meta ads", "ads"].some((k) => text.includes(k));
  const hasDateIntent = !!detectDateRangeInfoFromMessages(messages);
  return hasAdsIntent && hasDateIntent;
}

function normalizeGroupName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^nv\s*-\s*/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

8. ALERTAS E URGÊNCIAS — Verifique: prioridade máxima, alertas não resolvidos, pendências urgentes >1h, sentimento piorando, grupos inativos >3 dias com último sentimento negativo. Liste por urgência.

9. SUGESTÃO DE UPSELL — Identifique clientes com: score >75, sentimento positivo, ads performando, engajamento saudável, >6 meses como cliente. Candidatos ideais para aumento de investimento ou upgrade de plano.

10. PERGUNTAS SOBRE DADOS — Responda de forma direta e numérica. Se não tiver o dado, diga claramente. NUNCA invente números.

11. ANÁLISE DE NPS REAL — Analise os feedbacks reais coletados por pesquisa NPS direta. Compare com o NPS preditivo, identifique discrepâncias, destaque feedbacks críticos e indicações recebidas. Use esses dados para calibrar todas as outras análises e recomendações.

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
- Respostas entre 200-500 palavras. Dado simples = 1-2 linhas. Análise complexa = até 500. Nunca >600 palavras.
- Quando perguntarem sobre cutucadas (planejamento, histórico, próximas), consulte o histórico de cutucadas nos dados para responder com precisão.
- IMPORTANTE: Os dados de META ADS fornecidos já estão filtrados para o período EXATO solicitado pelo usuário. Quando o usuário perguntar valores de investimento ou métricas de um período específico (ex: "01/04 a 06/04"), os dados que você recebeu JÁ SÃO desse período. Reporte os valores EXATAMENTE como recebidos, sem arredondar ou estimar. Sempre mencione o período exato dos dados na resposta.
- Se o usuário pedir dados de ads de um período específico e os dados mostrarem "sem dados no período", informe que não há dados disponíveis para aquele intervalo exato.

13. ENVIO DE CUTUCADA — Quando o usuário pedir para enviar cutucada, cutucar, lembrar ou cobrar alguém da equipe, você pode fazer isso. Basta o usuário pedir e a cutucada será enviada imediatamente via WhatsApp para a pessoa.

12. CRIAÇÃO DE TAREFAS — Quando o usuário pedir para criar uma tarefa, extraia as informações e responda com um JSON entre as tags <CREATE_TASK> e </CREATE_TASK>.

Formato:
<CREATE_TASK>
{
  "title": "título claro e objetivo da tarefa",
  "description": "descrição detalhada do que precisa ser feito",
  "assigned_to": "Nome do responsável",
  "priority": "alta|media|baixa",
  "due_date": "YYYY-MM-DD",
  "group_id": "group_id do cliente se aplicável, ou null"
}
</CREATE_TASK>

EQUIPE DISPONÍVEL para atribuição: Alisson, Priscilla, Jader Costa, Murilo Araújo (Murillo), Netto Monge, Joel, Thais, Daniella, Victor Botto, Jiza.

Se o usuário não especificar:
- Responsável: infira baseado na função e no cliente mencionado (gestor do cliente, ou quem faz sentido)
- Prioridade: infira pela urgência ("urgente"/"até sexta" = alta, normal = media)
- Prazo: se mencionou "até sexta", calcule a data. Se não disse, sugira um prazo razoável
- group_id: se mencionou um cliente, use o group_id correspondente dos dados

Após o JSON, escreva uma confirmação amigável da tarefa criada com os detalhes formatados:
📋 **Tarefa:** título
**O QUE fazer:** descrição
**PARA QUEM:** cliente
**QUEM da equipe deve fazer:** responsável
**POR QUE é importante:** justificativa
**PRAZO sugerido:** data`;

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

    const { messages, type, gestorFilter, groupId, isMaster, userName } = await req.json();
    const safeMessages = Array.isArray(messages) ? messages : [];

    // Load configurable prompts from DB
    const { data: promptConfigs } = await supabase.from("ai_prompts_config").select("prompt_key, prompt_value");
    const promptMap = new Map<string, string>();
    for (const pc of (promptConfigs || [])) promptMap.set(pc.prompt_key, pc.prompt_value);

    const DB_SYSTEM_PROMPT = promptMap.get("vox_chat_system_prompt");
    const DB_MASTER_PROMPT = promptMap.get("vox_master_prompt");
    const DB_EQUIPE = promptMap.get("equipe_info");
    const DB_REGRAS = promptMap.get("regras_negocio");

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

    const npsSurveysPromise = supabase
      .from("nps_surveys")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    const coachMsgsPromise = supabase
      .from("coach_messages")
      .select("destinatario_nome, mensagem, tipo, group_id, enviada_em, resultado")
      .eq("enviada", true)
      .order("enviada_em", { ascending: false })
      .limit(30);

    const [pendingResResult, npsSurveysResult, coachMsgsResult, ...conversasResults] = await Promise.all([
      pendingResPromise,
      npsSurveysPromise,
      coachMsgsPromise,
      ...conversasPromises,
    ]);

    const pendingResolutions = pendingResResult.data || [];
    const allNpsSurveys = npsSurveysResult.data || [];
    const recentCoachMsgs = coachMsgsResult.data || [];

    // Build per-group message map
    const groupMsgsMap = new Map<string, any[]>();
    for (let i = 0; i < groupIds.length; i++) {
      const msgs = conversasResults[i].data || [];
      groupMsgsMap.set(groupIds[i], msgs);
    }

    // Detect date range from user messages for ads queries
    const detectedDateRange = detectDateRangeFromMessages(safeMessages);

    // Fetch Meta Ads data for groups with linked ad accounts
    const groupsWithAds = grupos.filter((g: any) => g.ad_account_id);
    const adsDataMap = new Map<string, any>();

    if (META_TOKEN && groupsWithAds.length > 0) {
      const adsPromises = groupsWithAds.map(async (g: any) => {
        const adsData = await fetchMetaAdsForAccount(
          g.ad_account_id, META_TOKEN,
          detectedDateRange?.since, detectedDateRange?.until
        );
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

    // NPS surveys grouped by group_id
    const npsByGroup = new Map<string, any[]>();
    for (const s of allNpsSurveys) {
      if (!npsByGroup.has(s.group_id)) npsByGroup.set(s.group_id, []);
      npsByGroup.get(s.group_id)!.push(s);
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
        const periodLabel = ads.date_range || "últimos 30 dias";
        line += `\n  📊 META ADS (${periodLabel}): Gasto R$${ads.spend.toFixed(2)}, ${ads.impressions} impressões, ${ads.clicks} cliques, CTR ${ads.ctr.toFixed(2)}%, CPC R$${ads.cpc.toFixed(2)}, Leads ${ads.leads}${ads.cpa ? `, CPA R$${ads.cpa.toFixed(2)}` : ""}, Alcance ${ads.reach}`;
      } else if (g.ad_account_id) {
        const periodLabel = detectedDateRange ? `${detectedDateRange.since} a ${detectedDateRange.until}` : "últimos 30 dias";
        line += `\n  📊 META ADS: Conta vinculada mas sem dados no período (${periodLabel})`;
      }

      // NPS Real surveys
      const groupSurveys = npsByGroup.get(gid) || [];
      if (groupSurveys.length > 0) {
        const avgNpsReal = (groupSurveys.reduce((s: number, sv: any) => s + sv.score, 0) / groupSurveys.length).toFixed(1);
        const lastSurveyDate = groupSurveys[0].created_at?.substring(0, 10) || "N/A";
        line += `\n  📋 NPS REAL: Média ${avgNpsReal}/10 (${groupSurveys.length} respostas, última em ${lastSurveyDate})`;
        // Include last 3 comments
        const withComments = groupSurveys.filter((sv: any) => sv.comment).slice(0, 3);
        for (const sv of withComments) {
          line += `\n    Nota ${sv.score}: "${(sv.comment || "").slice(0, 100)}"`;
          if (sv.quality_rating) line += ` | Qualidade: ${sv.quality_rating}`;
          if (sv.results_rating) line += ` | Resultados: ${sv.results_rating}`;
        }
        // Referrals
        const withReferrals = groupSurveys.filter((sv: any) => sv.referral_1_name);
        if (withReferrals.length > 0) {
          line += `\n    💡 ${withReferrals.length} resposta(s) com indicações de novos clientes`;
        }
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

    const coachHistoryContext = recentCoachMsgs.length > 0
      ? `\n\nHISTÓRICO DE CUTUCADAS RECENTES (últimas 30):\n${recentCoachMsgs.map((m: any) => `- [${m.enviada_em}] Para: ${m.destinatario_nome} | Tipo: ${m.tipo}${m.group_id ? ` | Cliente: ${grupos.find((g: any) => g.group_id === m.group_id)?.nome || m.group_id}` : ""} | Status: ${m.resultado || "enviada"} | Msg: "${m.mensagem?.slice(0, 80)}"`).join("\n")}\n\nNOTA: As cutucadas automáticas são enviadas pelo CS Coach em horário comercial (08:30-17:30, seg-sex). Você também pode enviar cutucadas manuais sob demanda quando o usuário pedir.`
      : "";

    const dataContext = `
DADOS DA OPERAÇÃO (${grupos.length} grupos, ${totalMsgs} mensagens analisadas, ${adsDataMap.size} contas de ads com dados):

${contextLines.join("\n")}
${coachHistoryContext}
`;

    const masterFirstName = isMaster && userName ? userName.split(' ')[0] : null;

    // Use DB prompts if available, otherwise fall back to hardcoded
    const EFFECTIVE_SYSTEM_PROMPT = DB_SYSTEM_PROMPT || SYSTEM_PROMPT;
    const EFFECTIVE_EQUIPE = DB_EQUIPE ? `\n\n${DB_EQUIPE}` : "";
    const EFFECTIVE_REGRAS = DB_REGRAS ? `\n\n${DB_REGRAS}` : "";

    const MASTER_PROMPT = isMaster && masterFirstName ? `
MODO MASTER ATIVO — Você está conversando com ${masterFirstName}, um dos sócios-proprietários da New Vox. Ele tem nível MASTER de acesso ao sistema.

TRATAMENTO:
- Trate ${masterFirstName} com proximidade e parceria, como braço direito estratégico da empresa
- Seja direta, confiante e proativa. Sem vaguezas, sem excesso de ressalvas
- Pode ser mais informal que com outros membros da equipe, mantendo profissionalismo
- Não use tom de subordinação ('se você permitir', 'posso ajudar?'). Use tom de parceria ('acabei de verificar', 'recomendo fazer X porque Y')
- Se identificar algo crítico, TRAGA a informação mesmo sem ser perguntada. Você é a consultora estratégica dele.

PERMISSÕES TOTAIS:
${masterFirstName} pode pedir qualquer coisa relacionada à operação. Você pode e deve:
- Responder qualquer pergunta sobre qualquer cliente (dados financeiros, satisfação, histórico, ads, NPS, risco de churn)
- Analisar e comparar performance individual de qualquer colaborador da equipe
- Mostrar dados estratégicos de negócio (MRR, receita por cliente, LTV, projeções)
- Executar ações administrativas via tags XML (ASSIGN_RESPONSIBLE, UPDATE_CLIENT, RESOLVE_PENDING, SYSTEM_CONTROL)

Quando ele pedir uma ação, EXECUTE direto. Só peça confirmação quando for destrutivo/irreversível (deletar permanente). Para criar, atribuir, modificar — execute e confirme o que foi feito em texto claro.

IMPORTANTE SOBRE PRISCILLA: Se ${masterFirstName} for 'Priscilla', ela é sócia MAS também trabalha na operação como social media. Se ela perguntar sobre clientes que ela atende operacionalmente, pode dar dicas práticas como se fosse para qualquer membro da equipe. Se ela perguntar como dona, dê visão estratégica. Identifique pelo tipo da pergunta.

ORIENTAÇÃO EM TEMPO REAL:
Se ${masterFirstName} descrever um problema acontecendo agora ('o cliente X tá bravo, o que faço?'), você deve:
1. Analisar o histórico do cliente imediatamente nos dados que você tem
2. Identificar causa provável
3. Sugerir ação específica e executável agora
4. Se fizer sentido, já preparar rascunho de resposta para ele enviar

HIERARQUIA DA EQUIPE NEW VOX:
- NÍVEL MASTER (donos, controle total): Alisson (sócio), Priscilla (sócia, também atua como social media operacional)
- ADMIN (gestão geral): Joel (gerente geral)
- GESTORES DE TRÁFEGO: Jader Costa, Murilo Araújo, Netto Monge
- EQUIPE OPERACIONAL: Thais, Daniella, Victor Botto, Jiza

Quando o master pedir para atribuir responsável, sugerir o membro mais adequado baseado em função:
- Questão de tráfego/ads → Jader, Murilo ou Netto
- Questão de social media/conteúdo → Priscilla ou Thais
- Questão gerencial/escalada → Joel
- Decisão estratégica → Alisson ou Priscilla (masters)

AÇÕES MASTER DISPONÍVEIS (responda com tags XML quando o master pedir):

1. ATRIBUIR RESPONSÁVEL:
<ASSIGN_RESPONSIBLE>
{"group_id": "group_id do cliente", "field": "gestor_responsavel|responsavel_master|responsavel_socio", "new_value": "Nome da pessoa"}
</ASSIGN_RESPONSIBLE>

2. ATUALIZAR CLIENTE:
<UPDATE_CLIENT>
{"group_id": "group_id", "updates": {"plano": "novo valor", "investimento_ads": 3000}}
</UPDATE_CLIENT>

3. RESOLVER PENDÊNCIA:
<RESOLVE_PENDING>
{"group_id": "group_id", "term": "termo da pendência", "resolved_by": "nome de quem resolveu"}
</RESOLVE_PENDING>

4. CONTROLE DO SISTEMA:
<SYSTEM_CONTROL>
{"action": "pause_coach|resume_coach", "target": "all", "reason": "motivo opcional"}
</SYSTEM_CONTROL>

Após cada ação, confirme o que foi feito em texto amigável.
` : "";

    const fullSystemPrompt = MASTER_PROMPT + SYSTEM_PROMPT + "\n\n" + dataContext;

    if (detectExactAdsSpendQuery(safeMessages)) {
      const lastUser = [...safeMessages].reverse().find((m: any) => m.role === "user");
      const userText = lastUser?.content?.toLowerCase() || "";
      const dateRangeInfo = detectDateRangeInfoFromMessages(safeMessages);
      const normalizedUserText = normalizeGroupName(userText);
      const matchedGroup = grupos.find((g: any) => {
        const normalizedName = normalizeGroupName(g.nome || "");
        return normalizedUserText.includes(normalizedName);
      });

      if (matchedGroup && dateRangeInfo) {
        const formatPeriod = (since: string, until: string) => {
          const formatOne = (value: string) => {
            const [year, month, day] = value.split("-");
            return `${day}/${month}/${year}`;
          };
          return `${formatOne(since)} a ${formatOne(until)}`;
        };

        const encoder = new TextEncoder();
        const sendSse = (content: string) => {
          const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
          return new Response(encoder.encode(sseData), {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        };

        if (!matchedGroup.ad_account_id) {
          return sendSse(`${matchedGroup.nome.replace(/^NV\s*-\s*/i, "")} não possui conta de Meta Ads vinculada.`);
        }

        let resolvedAds = adsDataMap.get(matchedGroup.group_id);
        let resolvedRange = { since: dateRangeInfo.since, until: dateRangeInfo.until };

        if (!dateRangeInfo.explicitYear) {
          const currentYear = new Date().getFullYear();
          const currentRange = buildDateRangeForYear(dateRangeInfo, currentYear);
          const previousRange = buildDateRangeForYear(dateRangeInfo, currentYear - 1);

          const [currentAds, previousAds] = await Promise.all([
            fetchMetaAdsForAccount(matchedGroup.ad_account_id, META_TOKEN!, currentRange.since, currentRange.until),
            fetchMetaAdsForAccount(matchedGroup.ad_account_id, META_TOKEN!, previousRange.since, previousRange.until),
          ]);

          const hasCurrentData = !!currentAds && currentAds.spend > 0;
          const hasPreviousData = !!previousAds && previousAds.spend > 0;

          if (hasCurrentData && hasPreviousData) {
            return sendSse(`Encontrei dados para mais de um ano no intervalo ${dateRangeInfo.startDay}/${dateRangeInfo.startMonth} a ${dateRangeInfo.endDay}/${dateRangeInfo.endMonth}. Para te responder com precisão, me diga se você quer ${currentYear} ou ${currentYear - 1}.`);
          }

          if (hasCurrentData) {
            resolvedAds = currentAds;
            resolvedRange = currentRange;
          } else if (hasPreviousData) {
            resolvedAds = previousAds;
            resolvedRange = previousRange;
          }
        }

        if (resolvedAds) {
          return sendSse(`O gasto total do Meta Ads de ${matchedGroup.nome.replace(/^NV\s*-\s*/i, "")} no período de ${formatPeriod(resolvedRange.since, resolvedRange.until)} foi de R$${resolvedAds.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
        }

        return sendSse(`Não encontrei dados de Meta Ads para ${matchedGroup.nome.replace(/^NV\s*-\s*/i, "")} no período de ${formatPeriod(resolvedRange.since, resolvedRange.until)}.`);
      }
    }

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

    // Webhook map for cutucadas
    const CUTUCADA_WEBHOOK_MAP: Record<string, string> = {
      "Murillo": "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
      "Murilo": "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
      "Priscilla": "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
      "Priscila": "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
      "Netto": "https://bot-n8n.1lxz8u.easypanel.host/webhook/2ee4657c-1125-4337-8c80-1977daa94bd3",
      "Jader": "https://bot-n8n.1lxz8u.easypanel.host/webhook/fb54db1e-c06c-4b55-bf2f-49a80c40943e",
    };

    // Check for cutucada intent
    const isCutucada = detectCutucadaIntent(safeMessages);
    if (isCutucada) {
      const cutucadaSystemPrompt = `${fullSystemPrompt}

CAPACIDADE ADICIONAL - ENVIAR CUTUCADA:
Quando o usuário pedir para enviar uma cutucada, cutucar, lembrar ou cobrar alguém da equipe, você DEVE extrair as informações e responder com um JSON entre as tags <SEND_CUTUCADA> e </SEND_CUTUCADA>.

Formato:
<SEND_CUTUCADA>
{
  "destinatario": "Nome do destinatário",
  "mensagem_contexto": "Contexto da cutucada",
  "group_name": "nome do cliente (ou null)",
  "tipo": "pendencia_esquecida|frt_alto|grupo_parado|geral|tarefa_pendente"
}
</SEND_CUTUCADA>

EQUIPE DISPONÍVEL para cutucada: Murilo Araújo (Murillo), Netto Monge, Jader Costa, Priscilla.

Após o JSON, escreva uma confirmação amigável.
Se não especificou para quem, pergunte antes de gerar o JSON.`;

      const cutucadaResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "system", content: cutucadaSystemPrompt }, ...safeMessages],
        }),
      });

      if (!cutucadaResponse.ok) {
        return new Response(JSON.stringify({ error: "Erro ao processar cutucada" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cutucadaData = await cutucadaResponse.json();
      let content = cutucadaData.choices?.[0]?.message?.content || "";

      const cutucadaMatch = content.match(/<SEND_CUTUCADA>([\s\S]*?)<\/SEND_CUTUCADA>/);
      if (cutucadaMatch) {
        try {
          const info = JSON.parse(cutucadaMatch[1].trim());
          const targetName = info.destinatario;
          
          // Find webhook
          const targetWebhookUrl = Object.entries(CUTUCADA_WEBHOOK_MAP).find(([key]) =>
            targetName.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(targetName.toLowerCase().split(" ")[0])
          )?.[1];

          if (!targetWebhookUrl) {
            content = content.replace(/<SEND_CUTUCADA>[\s\S]*?<\/SEND_CUTUCADA>/, "");
            content += "\n\n⚠️ Não encontrei o webhook para essa pessoa.";
          } else {
            // Find matched group
            let matchedGroup: any = null;
            if (info.group_name) {
              matchedGroup = grupos.find((g: any) =>
                g.nome.toLowerCase().includes(info.group_name.toLowerCase())
              );
            }

            // Generate cutucada message
            const targetFirstName = targetName.split(" ")[0];
            let cutucadaMsg = "";
            try {
              const genResp = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: `Você é a Vox, coach de CS. Gere uma cutucada curta para ${targetFirstName}. Tom amigável. Máx 300 chars. Termine com "(responda 👍 se já fez)".` },
                    { role: "user", content: `Cutucada: ${info.mensagem_contexto}${matchedGroup ? ` (cliente: ${matchedGroup.nome})` : ""}` },
                  ],
                  max_tokens: 200,
                }),
              });
              if (genResp.ok) {
                const genData = await genResp.json();
                cutucadaMsg = genData.choices?.[0]?.message?.content?.trim() || "";
              }
            } catch (e) {
              console.error("Error generating cutucada msg:", e);
            }

            if (!cutucadaMsg) {
              cutucadaMsg = `E aí ${targetFirstName}! 👋 ${info.mensagem_contexto}. Bora resolver? (responda 👍 se já fez)`;
            }

            // Send via webhook
            try {
              const encodedMsg = encodeURIComponent(cutucadaMsg);
              await fetch(`${targetWebhookUrl}?message=${encodedMsg}`);
              
              // Save to coach_messages
              await supabase.from("coach_messages").insert({
                destinatario_nome: targetName,
                mensagem: cutucadaMsg,
                tipo: info.tipo || "geral",
                group_id: matchedGroup?.group_id || null,
                enviada: true,
                enviada_em: new Date().toISOString(),
              });

              content = content.replace(/<SEND_CUTUCADA>[\s\S]*?<\/SEND_CUTUCADA>/, "");
              content += `\n\n✅ **Cutucada enviada para ${targetName}!** Mensagem: "${cutucadaMsg.slice(0, 100)}..."`;
            } catch (e) {
              console.error("Error sending cutucada:", e);
              content = content.replace(/<SEND_CUTUCADA>[\s\S]*?<\/SEND_CUTUCADA>/, "");
              content += "\n\n⚠️ Erro ao enviar cutucada. Tente novamente.";
            }
          }
        } catch (parseErr) {
          console.error("Error parsing cutucada:", parseErr);
        }
      }

      const encoder = new TextEncoder();
      const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(encoder.encode(sseData), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Check for task creation intent
    const isTaskCreation = detectTaskIntent(safeMessages);
    if (isTaskCreation) {
      const taskSystemPrompt = `${fullSystemPrompt}

CAPACIDADE ADICIONAL - CRIAÇÃO DE TAREFAS:
Quando o usuário pedir para criar uma tarefa, você DEVE extrair as informações e responder com um JSON entre as tags <CREATE_TASK> e </CREATE_TASK>.

Formato:
<CREATE_TASK>
{
  "title": "título claro e objetivo da tarefa",
  "description": "descrição detalhada do que precisa ser feito",
  "assigned_to": "Nome do responsável",
  "priority": "alta|media|baixa",
  "due_date": "YYYY-MM-DD",
  "group_id": "group_id do cliente se aplicável, ou null"
}
</CREATE_TASK>

EQUIPE DISPONÍVEL para atribuição: Alisson, Priscilla, Jader Costa, Murilo Araújo (Murillo), Netto Monge, Joel, Thais, Daniella, Victor Botto, Jiza.

Se o usuário não especificar:
- Responsável: infira baseado na função e no cliente mencionado
- Prioridade: infira pela urgência ("urgente"/"até sexta" = alta, normal = media)  
- Prazo: se mencionou "até sexta", calcule a data. Se não disse, sugira um prazo razoável
- group_id: se mencionou um cliente, use o group_id correspondente dos dados

Após o JSON, escreva uma confirmação amigável da tarefa com detalhes formatados:
📋 **Tarefa:** título
**O QUE fazer:** descrição
**PARA QUEM:** cliente
**QUEM da equipe deve fazer:** responsável
**POR QUE é importante:** justificativa
**PRAZO sugerido:** data

A data de hoje é ${new Date().toISOString().split("T")[0]}.`;

      const taskResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "system", content: taskSystemPrompt }, ...safeMessages],
        }),
      });

      if (!taskResponse.ok) {
        return new Response(JSON.stringify({ error: "Erro ao processar criação de tarefa" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const taskData = await taskResponse.json();
      let content = taskData.choices?.[0]?.message?.content || "";

      // Extract and process task
      const taskMatch = content.match(/<CREATE_TASK>([\s\S]*?)<\/CREATE_TASK>/);
      if (taskMatch) {
        try {
          const taskInfo = JSON.parse(taskMatch[1].trim());
          
          const { error: insertError } = await supabase.from("tasks").insert({
            title: taskInfo.title,
            description: taskInfo.description || null,
            assigned_to: taskInfo.assigned_to || "Joel",
            priority: taskInfo.priority || "media",
            due_date: taskInfo.due_date || null,
            group_id: taskInfo.group_id || null,
            status: "todo",
            created_by: "Vox (IA)",
          });

          if (insertError) {
            console.error("Error inserting task:", insertError);
            content = content.replace(/<CREATE_TASK>[\s\S]*?<\/CREATE_TASK>/, "");
            content += "\n\n⚠️ Houve um erro ao salvar a tarefa. Tente novamente.";
          } else {
            content = content.replace(/<CREATE_TASK>[\s\S]*?<\/CREATE_TASK>/, "");
            content += "\n\n✅ **Tarefa salva no Quadro de Tarefas!** Acesse a aba Tarefas para visualizar.";
          }
        } catch (parseErr) {
          console.error("Error parsing task:", parseErr);
        }
      }

      // Return as SSE stream format
      const encoder = new TextEncoder();
      const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(encoder.encode(sseData), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Check for scheduling intent
    const isScheduling = detectSchedulingIntent(safeMessages);
    if (isScheduling) {
      const schedulingSystemPrompt = `${SYSTEM_PROMPT}

CAPACIDADE ADICIONAL - AGENDAMENTO:
Quando o usuário pedir para agendar algo, você deve extrair as informações e responder com um JSON entre as tags <SCHEDULE_EVENT> e </SCHEDULE_EVENT>.

Formato:
<SCHEDULE_EVENT>
{
  "title": "título do evento",
  "description": "descrição opcional",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "event_type": "reuniao|compromisso|lembrete|pessoal|cliente",
  "participants": ["Nome1", "Nome2"],
  "location": "local opcional"
}
</SCHEDULE_EVENT>

EQUIPE DISPONÍVEL para participantes: Alisson, Priscilla, Jader Costa, Murilo Araújo, Netto Monge, Joel, Thais, Daniella, Victor Botto, Jiza.

Se o usuário não especificar todos os campos, infira o melhor possível:
- Se não disse horário, sugira um horário comercial (09:00-10:00)
- Se não disse data, use a data de hoje ou a próxima data útil
- Se mencionou um cliente, use event_type "cliente"
- Se mencionou pessoa da equipe, inclua nos participants
- Duração padrão: 1 hora

Após o JSON, escreva uma confirmação amigável do agendamento.
Se faltarem informações críticas (como quem participará ou sobre o quê), pergunte antes de gerar o JSON.

${dataContext}`;

      const schedResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "system", content: schedulingSystemPrompt }, ...safeMessages],
        }),
      });

      if (!schedResponse.ok) {
        return new Response(JSON.stringify({ error: "Erro ao processar agendamento" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const schedData = await schedResponse.json();
      let content = schedData.choices?.[0]?.message?.content || "";

      // Extract and process schedule event
      const schedMatch = content.match(/<SCHEDULE_EVENT>([\s\S]*?)<\/SCHEDULE_EVENT>/);
      if (schedMatch) {
        try {
          const eventData = JSON.parse(schedMatch[1].trim());
          const startISO = `${eventData.date}T${eventData.start_time}:00`;
          const endISO = `${eventData.date}T${eventData.end_time}:00`;

          const colorMap: Record<string, string> = {
            reuniao: "#3b82f6", compromisso: "#8b5cf6", lembrete: "#f59e0b",
            pessoal: "#10b981", cliente: "#ef4444"
          };

          const { error: insertError } = await supabase.from("calendar_events").insert({
            title: eventData.title,
            description: eventData.description || null,
            start_time: startISO,
            end_time: endISO,
            event_type: eventData.event_type || "reuniao",
            created_by: "Vox (IA)",
            participants: eventData.participants || [],
            location: eventData.location || null,
            color: colorMap[eventData.event_type] || "#3b82f6",
          });

          if (insertError) {
            console.error("Error inserting event:", insertError);
            content = content.replace(/<SCHEDULE_EVENT>[\s\S]*?<\/SCHEDULE_EVENT>/, "");
            content += "\n\n⚠️ Houve um erro ao salvar o evento na agenda. Tente novamente.";
          } else {
            content = content.replace(/<SCHEDULE_EVENT>[\s\S]*?<\/SCHEDULE_EVENT>/, "");
            content += "\n\n✅ **Evento salvo na agenda interna!** Acesse a aba Agenda para visualizar.";
          }
        } catch (parseErr) {
          console.error("Error parsing schedule event:", parseErr);
        }
      }

      // Return as SSE stream format for consistency
      const encoder = new TextEncoder();
      const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(encoder.encode(sseData), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Master action detection
    if (isMaster) {
      const lastUserMsg = getLastUserMessage(safeMessages);
      const lastText = lastUserMsg?.content?.toLowerCase() || "";
      const masterActionKeywords = [
        "atribui", "coloca como gestor", "muda o gestor", "tira o", "transfere",
        "muda o plano", "atualiza o investimento", "altera", "marca o aniversário",
        "resolve a pendência", "marca como feito", "marca como resolvido",
        "pausa o coach", "desativa", "ativa o coach", "liga o coach",
        "atualiza o briefing", "muda o", "altera o",
      ];
      const isMasterAction = masterActionKeywords.some(k => lastText.includes(k));

      if (isMasterAction) {
        const masterResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [{ role: "system", content: fullSystemPrompt }, ...safeMessages],
          }),
        });

        if (masterResponse.ok) {
          const masterData = await masterResponse.json();
          let content = masterData.choices?.[0]?.message?.content || "";

          // Process ASSIGN_RESPONSIBLE
          const assignMatch = content.match(/<ASSIGN_RESPONSIBLE>([\s\S]*?)<\/ASSIGN_RESPONSIBLE>/);
          if (assignMatch) {
            try {
              const info = JSON.parse(assignMatch[1].trim());
              const allowedFields = ["gestor_responsavel", "responsavel_master", "responsavel_socio"];
              if (info.group_id && allowedFields.includes(info.field)) {
                const { data: before } = await supabase.from("whatsapp_grupos").select("*").eq("group_id", info.group_id).single();
                await supabase.from("whatsapp_grupos").update({ [info.field]: info.new_value }).eq("group_id", info.group_id);
                await supabase.from("master_actions_log").insert({
                  executed_by: userName || "Master",
                  action_type: "assign_responsible",
                  target_group_id: info.group_id,
                  description: `Alterou ${info.field} para "${info.new_value}" no grupo ${before?.nome || info.group_id}`,
                  dados_antes: { [info.field]: before?.[info.field] },
                  dados_depois: { [info.field]: info.new_value },
                });
                content = content.replace(/<ASSIGN_RESPONSIBLE>[\s\S]*?<\/ASSIGN_RESPONSIBLE>/, "");
                content += `\n\n✅ **Responsável atualizado!** ${info.field} → ${info.new_value}`;
              }
            } catch (e) { console.error("ASSIGN_RESPONSIBLE error:", e); }
          }

          // Process UPDATE_CLIENT
          const updateMatch = content.match(/<UPDATE_CLIENT>([\s\S]*?)<\/UPDATE_CLIENT>/);
          if (updateMatch) {
            try {
              const info = JSON.parse(updateMatch[1].trim());
              if (info.group_id && info.updates) {
                const { data: before } = await supabase.from("whatsapp_grupos").select("*").eq("group_id", info.group_id).single();
                await supabase.from("whatsapp_grupos").update(info.updates).eq("group_id", info.group_id);
                await supabase.from("master_actions_log").insert({
                  executed_by: userName || "Master",
                  action_type: "update_client",
                  target_group_id: info.group_id,
                  description: `Atualizou dados do grupo ${before?.nome || info.group_id}: ${Object.keys(info.updates).join(", ")}`,
                  dados_antes: before || {},
                  dados_depois: info.updates,
                });
                content = content.replace(/<UPDATE_CLIENT>[\s\S]*?<\/UPDATE_CLIENT>/, "");
                content += `\n\n✅ **Cliente atualizado!** Campos: ${Object.keys(info.updates).join(", ")}`;
              }
            } catch (e) { console.error("UPDATE_CLIENT error:", e); }
          }

          // Process RESOLVE_PENDING
          const resolveMatch = content.match(/<RESOLVE_PENDING>([\s\S]*?)<\/RESOLVE_PENDING>/);
          if (resolveMatch) {
            try {
              const info = JSON.parse(resolveMatch[1].trim());
              if (info.group_id && info.term) {
                await supabase.from("pending_demand_resolutions")
                  .update({ resolved: true, resolved_at: new Date().toISOString(), status: "resolvido" })
                  .eq("group_id", info.group_id)
                  .ilike("term", `%${info.term}%`);
                await supabase.from("master_actions_log").insert({
                  executed_by: userName || "Master",
                  action_type: "resolve_pending",
                  target_group_id: info.group_id,
                  description: `Resolveu pendência "${info.term}" ${info.resolved_by ? `(por ${info.resolved_by})` : ""}`,
                });
                content = content.replace(/<RESOLVE_PENDING>[\s\S]*?<\/RESOLVE_PENDING>/, "");
                content += `\n\n✅ **Pendência resolvida!** "${info.term}"`;
              }
            } catch (e) { console.error("RESOLVE_PENDING error:", e); }
          }

          // Process SYSTEM_CONTROL
          const controlMatch = content.match(/<SYSTEM_CONTROL>([\s\S]*?)<\/SYSTEM_CONTROL>/);
          if (controlMatch) {
            try {
              const info = JSON.parse(controlMatch[1].trim());
              if (info.action === "pause_coach") {
                await supabase.from("coach_config").update({ ativo: false }).neq("id", "00000000");
                content = content.replace(/<SYSTEM_CONTROL>[\s\S]*?<\/SYSTEM_CONTROL>/, "");
                content += "\n\n✅ **CS Coach pausado!**";
              } else if (info.action === "resume_coach") {
                await supabase.from("coach_config").update({ ativo: true }).neq("id", "00000000");
                content = content.replace(/<SYSTEM_CONTROL>[\s\S]*?<\/SYSTEM_CONTROL>/, "");
                content += "\n\n✅ **CS Coach reativado!**";
              }
              await supabase.from("master_actions_log").insert({
                executed_by: userName || "Master",
                action_type: "system_control",
                description: `Ação: ${info.action}${info.reason ? ` — ${info.reason}` : ""}`,
              });
            } catch (e) { console.error("SYSTEM_CONTROL error:", e); }
          }

          const encoder = new TextEncoder();
          const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
          return new Response(encoder.encode(sseData), {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }
      }
    }

    // Chat mode: choose model based on complexity or ads date queries
    const isComplex = detectComplexQuery(safeMessages);
    const hasDateRange = !!detectedDateRange;
    const model = (isComplex || hasDateRange || isMaster) ? "gpt-4o" : "gpt-4o-mini";
    console.log(`Chat mode: using ${model} (complex=${isComplex}, dateRange=${hasDateRange}, master=${!!isMaster})`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: fullSystemPrompt }, ...safeMessages],
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
