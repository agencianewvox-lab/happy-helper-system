export const metricLabels = {
  leads: "Leads reais · CRM",
  scheduled: "Pessoas que avançaram para agendamento",
  attended: "Pessoas que avançaram para comparecimento",
  sales: "Vendas fechadas · Meta / Voxi",
  revenue: "Valor vendido · Meta / Voxi",
  spend: "Investimento · Meta",
  impressions: "Impressões · Meta",
  clicks: "Cliques no link · Meta",
  ctr: "CTR de link · Meta",
  cpl: "Custo por lead Meta real",
  cpc: "Custo por clique no link · Meta",
  cpm: "Custo por mil impressões · Meta",
};
export type Metric = keyof typeof metricLabels;
export type ReportSettings = {
  schemaVersion?: number;
  title: string;
  intro: string;
  metrics: Metric[];
  pipelines: string[];
  stages: { scheduled: string[]; attended: string[] };
  period: "yesterday" | "last7" | "last30" | "previousMonth" | "custom";
  frequency: "daily" | "weekly" | "monthly" | "once";
  template?: string;
  includeToday?: boolean;
  customStart?: string;
  customEnd?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  onceDate?: string;
  skipWeekends?: boolean;
  dataMode?: "crm_meta" | "meta";
  campaignIds?: string[];
  includeCampaigns?: boolean;
  minClicks?: number;
  minImpressions?: number;
  weekdays: number[];
  monthDay: number;
  time: string;
  timezone: string;
  ranking: "leads" | "sales" | "cpl" | "clicks" | "spend" | "ctr" | "cpc";
  top: number;
  minLeads: number;
  includeAds: boolean;
};
export const defaultSettings: ReportSettings = {
  title: "Seu resultado com a Newvox",
  intro: "Olá, equipe! Confira o acompanhamento do período.",
  schemaVersion: 2,
  metrics: ["leads", "spend", "cpl"],
  pipelines: [],
  stages: { scheduled: [], attended: [] },
  period: "last7",
  frequency: "weekly",
  weekdays: [1],
  monthDay: 1,
  time: "09:00",
  timezone: "America/Sao_Paulo",
  ranking: "leads",
  top: 3,
  minLeads: 1,
  includeAds: true,
};
export function validateSettings(value: unknown): ReportSettings {
  if (!value || typeof value !== "object")
    throw new Error("Configuração inválida.");
  const s = value as ReportSettings;
  const ids = (a: unknown): a is string[] =>
    Array.isArray(a) &&
    a.length <= 100 &&
    a.every((x) => typeof x === "string" && /^[a-f0-9-]{36}$/i.test(x));
  if (
    typeof s.title !== "string" ||
    s.title.length > 100 ||
    !s.title.trim() ||
    typeof s.intro !== "string" ||
    s.intro.length > 400 ||
    !Array.isArray(s.metrics) ||
    s.metrics.length < 1 ||
    new Set(s.metrics).size !== s.metrics.length ||
    s.metrics.some(
      (m) => !Object.prototype.hasOwnProperty.call(metricLabels, m),
    ) ||
    !ids(s.pipelines) ||
    !s.stages ||
    !ids(s.stages.scheduled) ||
    !ids(s.stages.attended) ||
    !["yesterday", "last7", "last30", "previousMonth", "custom"].includes(
      s.period,
    ) ||
    !["daily", "weekly", "monthly", "once"].includes(s.frequency) ||
    !Array.isArray(s.weekdays) ||
    (s.frequency === "weekly" && !s.weekdays.length) ||
    new Set(s.weekdays).size !== s.weekdays.length ||
    s.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    !Number.isInteger(s.monthDay) ||
    s.monthDay < 1 ||
    s.monthDay > 31 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ||
    ![
      "America/Sao_Paulo",
      "America/Manaus",
      "America/Rio_Branco",
      "America/Noronha",
    ].includes(s.timezone) ||
    !["leads", "sales", "cpl", "clicks", "spend", "ctr", "cpc"].includes(
      s.ranking,
    ) ||
    !Number.isInteger(s.top) ||
    s.top < 1 ||
    s.top > 5 ||
    !Number.isInteger(s.minLeads) ||
    s.minLeads < 1 ||
    s.minLeads > 1000 ||
    typeof s.includeAds !== "boolean"
  )
    throw new Error("Revise os campos do relatório.");
  if (s.dataMode !== undefined && !["crm_meta", "meta"].includes(s.dataMode))
    throw new Error("Fonte inválida.");
  if (
    s.campaignIds !== undefined &&
    (!Array.isArray(s.campaignIds) ||
      s.campaignIds.length > 100 ||
      new Set(s.campaignIds).size !== s.campaignIds.length ||
      s.campaignIds.some(
        (id) => typeof id !== "string" || !/^\d{1,30}$/.test(id),
      ))
  )
    throw new Error("Seleção de campanhas inválida.");
  if (
    s.includeCampaigns !== undefined &&
    typeof s.includeCampaigns !== "boolean"
  )
    throw new Error("Opção inválida.");
  for (const key of ["minClicks", "minImpressions"] as const)
    if (
      s[key] !== undefined &&
      (!Number.isInteger(s[key]) || s[key]! < 0 || s[key]! > 1000000000)
    )
      throw new Error("Volume mínimo inválido.");
  if (
    s.dataMode === "meta" &&
    (s.metrics.some((m) => crmMetrics.includes(m)) ||
      ["leads", "sales", "cpl"].includes(s.ranking) ||
      s.pipelines.length ||
      s.stages.scheduled.length ||
      s.stages.attended.length ||
      templateMetrics(s.template || "").some((m) => crmMetrics.includes(m)))
  )
    throw new Error(
      "No modo só Meta, use apenas métricas e ranking da Meta. Leads reais e vendas exigem CRM.",
    );
  if (
    s.template !== undefined &&
    (typeof s.template !== "string" || s.template.length > 7000)
  )
    throw new Error("Mensagem deve ter até 7.000 caracteres.");
  if (s.includeAds && !s.metrics.includes(rankingMetric(s.ranking))) throw new Error("Selecione a métrica do critério de destaque ou desative os destaques.");
  if (s.template?.trim()) {
    const unselected = templateMetrics(s.template).filter(m => !s.metrics.includes(m));
    if (unselected.length) throw new Error("Variáveis de métricas não selecionadas: " + unselected.map(m => metricLabels[m]).join(", "));
    const unknown = unknownTokens(s.template);
    if (unknown.length)
      throw new Error("Variáveis não reconhecidas: " + unknown.join(", "));
    if (/{{|}}/.test(s.template.replace(/{{\s*[^{}]+\s*}}/g, "")))
      throw new Error("Revise as chaves das variáveis da mensagem.");
  }
  for (const key of ["includeToday", "skipWeekends"] as const)
    if (s[key] !== undefined && typeof s[key] !== "boolean")
      throw new Error("Opção inválida.");
  for (const key of [
    "customStart",
    "customEnd",
    "scheduleStart",
    "scheduleEnd",
    "onceDate",
  ] as const)
    if (s[key] !== undefined && s[key] !== "" && !validDate(s[key]))
      throw new Error("Data inválida.");
  if (
    s.period === "custom" &&
    (!validDate(s.customStart) ||
      !validDate(s.customEnd) ||
      s.customStart! > s.customEnd! ||
      Date.parse(s.customEnd!) - Date.parse(s.customStart!) > 366 * 86400000)
  )
    throw new Error("Escolha um período válido de até 367 dias.");
  if (s.scheduleStart && s.scheduleEnd && s.scheduleStart > s.scheduleEnd)
    throw new Error("Fim da agenda deve ser posterior ao início.");
  if (s.frequency === "once" && !validDate(s.onceDate))
    throw new Error("Escolha a data do envio único.");
  return {
    schemaVersion: 2,
    title: s.title.trim(),
    intro: s.intro.trim(),
    metrics: s.metrics,
    pipelines: s.pipelines,
    stages: s.stages,
    period: s.period,
    frequency: s.frequency,
    weekdays: s.weekdays,
    monthDay: s.monthDay,
    time: s.time,
    timezone: s.timezone,
    ranking: s.ranking,
    top: s.top,
    minLeads: s.minLeads,
    includeAds: s.includeAds,
    template: s.template || "",
    includeToday: s.includeToday || false,
    customStart: s.customStart || "",
    customEnd: s.customEnd || "",
    scheduleStart: s.scheduleStart || "",
    scheduleEnd: s.scheduleEnd || "",
    onceDate: s.onceDate || "",
    skipWeekends: s.skipWeekends || false,
    dataMode: s.dataMode || "crm_meta",
    campaignIds: s.campaignIds || [],
    includeCampaigns: s.includeCampaigns || false,
    minClicks: s.minClicks || 0,
    minImpressions: s.minImpressions || 0,
  };
}
export function localParts(now: Date, timezone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return {
    date: p.year + "-" + p.month + "-" + p.day,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}
function shift(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function zonedMidnight(date: string, timezone: string) {
  let guess = Date.parse(date + "T00:00:00Z");
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const local = Date.parse(
      p.year +
        "-" +
        p.month +
        "-" +
        p.day +
        "T" +
        p.hour +
        ":" +
        p.minute +
        ":" +
        p.second +
        "Z",
    );
    guess += Date.parse(date + "T00:00:00Z") - local;
  }
  return new Date(guess).toISOString();
}
export function reportPeriod(s: ReportSettings, now = new Date()) {
  const today = localParts(now, s.timezone).date;
  let start = shift(
      today,
      s.period === "last7" ? -7 : s.period === "last30" ? -30 : -1,
    ),
    end = today;
  if (s.includeToday && (s.period === "last7" || s.period === "last30")) {
    end = shift(today, 1);
    start = shift(end, s.period === "last7" ? -7 : -30);
  }
  if (s.period === "custom") {
    if (
      !validDate(s.customStart) ||
      !validDate(s.customEnd) ||
      s.customStart! > s.customEnd!
    )
      throw new Error("Período personalizado inválido.");
    start = s.customStart!;
    end = shift(s.customEnd!, 1);
    if (s.customEnd! > today)
      throw new Error("O relatório não pode incluir datas futuras.");
  }
  if (s.period === "previousMonth") {
    end = today.slice(0, 7) + "-01";
    const d = new Date(end + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 1);
    start = d.toISOString().slice(0, 10);
  }
  return {
    startDate: start,
    endDate: shift(end, -1),
    start: zonedMidnight(start, s.timezone),
    end: zonedMidnight(end, s.timezone),
    timezone: s.timezone,
  };
}
export function scheduleSlot(
  s: ReportSettings,
  now = new Date(),
  allowLate = false,
): string | null {
  const p = localParts(now, s.timezone),
    d = new Date(p.date + "T12:00:00Z");
  if (
    (s.scheduleStart && p.date < s.scheduleStart) ||
    (s.scheduleEnd && p.date > s.scheduleEnd)
  )
    return null;
  if (s.frequency === "once" && p.date !== s.onceDate) return null;
  if (
    s.skipWeekends &&
    s.frequency === "daily" &&
    [0, 6].includes(d.getUTCDay())
  )
    return null;
  // A fixed historical interval is never resent by a recurring schedule.
  if (s.period === "custom" && s.frequency !== "once") return null;
  const [h, m] = s.time.split(":").map(Number),
    diff = p.minutes - h * 60 - m;
  if (diff < 0 || (!allowLate && diff > 15)) return null;
  if (s.frequency === "weekly" && !s.weekdays.includes(d.getUTCDay()))
    return null;
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (
    s.frequency === "monthly" &&
    d.getUTCDate() !== Math.min(s.monthDay, last)
  )
    return null;
  // No version/hour in key: edits cannot duplicate an already dispatched local day.
  return p.date;
}
export const rankingDescriptions: Record<ReportSettings["ranking"], string> = {
  leads: "Mais pessoas com entrada real atribuída ao anúncio no Voxi. Não são leads estimados pela Meta.",
  sales: "Mais vendas fechadas com atribuição Meta comprovada. A data é de aprovação/fechamento, não de recebimento.",
  cpl: "Menor investimento por lead real atribuído. Anúncios sem amostra mínima não entram.",
  clicks: "Mais cliques no link. Cliques não equivalem a leads ou vendas.",
  spend: "Maior investimento no período. Mais gasto não comprova melhor desempenho.",
  ctr: "Maior taxa de cliques no link, respeitando o mínimo de impressões.",
  cpc: "Menor custo por clique no link, respeitando o mínimo de cliques.",
};
export const rankingLabels: Record<ReportSettings["ranking"], string> = {
  leads: "Mais leads reais", sales: "Mais vendas fechadas", cpl: "Menor CPL real", clicks: "Mais cliques no link",
  spend: "Maior investimento", ctr: "Maior CTR de link", cpc: "Menor CPC de link",
};
export function rankingMetric(ranking: ReportSettings["ranking"]): Metric { return ranking; }
export function nextExecutions(s: ReportSettings, now = new Date(), count = 3): string[] {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.time) || !Number.isFinite(+now)) return [];
  try { new Intl.DateTimeFormat("en", { timeZone: s.timezone }); } catch { return []; }
  const output: string[] = [];
  const today = localParts(now, s.timezone).date;
  const [h,m] = s.time.split(":").map(Number);
  for (let day=0; day<1100 && output.length<count; day++) {
    const date = shift(today, day);
    const at = new Date(Date.parse(zonedMidnight(date,s.timezone))+(h*60+m)*60000);
    if (at > now && scheduleSlot(s,at)) output.push(at.toISOString());
    if(s.frequency==="once" && date >= (s.onceDate || today)) break;
  }
  return output;
}
export function scheduleOccurrences(s: ReportSettings, from: Date, to: Date): {slot: string; at: string; expired: boolean}[] {
  const out: {slot:string;at:string;expired:boolean}[] = [];
  const start = localParts(from,s.timezone).date, end = localParts(to,s.timezone).date;
  const [h,m]=s.time.split(":").map(Number);
  for(let day=0; day<1100; day++) {
    const date=shift(start,day); if(date>end) break;
    const at=new Date(Date.parse(zonedMidnight(date,s.timezone))+(h*60+m)*60000);
    if(at>=from && at<=to && scheduleSlot(s,at)) out.push({slot:date,at:at.toISOString(),expired:+to-+at>15*60000});
  }
  return out;
}
export function metricValue(metric: Metric, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Indisponível";
  if (["revenue","spend","cpl","cpc","cpm"].includes(metric)) return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
  return metric==="ctr" ? value.toFixed(2)+"%" : value.toLocaleString("pt-BR");
}
export function adHighlights(s: ReportSettings, result: any): string {
  if(!s.includeAds || !s.metrics.includes(rankingMetric(s.ranking))) return "";
  if(!result.ads?.length) return "*Destaques dos anúncios*\nNenhum anúncio atende ao critério e à amostra mínima.";
  return "*Destaques dos anúncios*\nCritério: "+rankingLabels[s.ranking]+(s.ranking==="spend"?" (gasto, não eficiência)":"")+"\n"+
    result.ads.map((ad:any,i:number) => (i+1)+". "+String(ad.name).replace(/[\r\n]/g," ")+" · "+
      metricLabels[rankingMetric(s.ranking)]+": "+metricValue(rankingMetric(s.ranking),ad[s.ranking])+
      (typeof ad.url==="string" && /^https:\/\//.test(ad.url) ? "\n"+ad.url : "")).join("\n");
}
export function renderReport(name:string,s:ReportSettings,result:any):string {
  const body=s.template?.trim()?renderTemplate(s.template,name,s,result):[
    "*NEWVOX | "+s.title+"*","*"+name.replace(/[\r\n]/g," ")+"*",
    result.period.startDate+" a "+result.period.endDate+" · "+s.timezone,"",s.intro,"",
    ...s.metrics.map(m=>"• "+metricLabels[m]+": "+metricValue(m,result.metrics[m])),
    ...(s.includeAds?["",adHighlights(s,result)]:[]),
    ...(s.includeCampaigns && result.campaigns?.length?["","*Campanhas do período*",campaignText(result.campaigns,s)]:[]),
  ].join("\n");
  // Diagnostic warnings belong only to the internal review, never to the customer's message.
  const footer=[s.dataMode==="meta"?"Fonte: Meta Ads · Sem dados de CRM":"Fontes: Voxi (comercial) · Meta (mídia)"];
  if(s.dataMode!=="meta" && s.metrics.some(m=>m==="sales"||m==="revenue")) footer.push("Vendas Meta fechadas por "+(result.salesSource==="clinicorp"?"aprovação de orçamento Clinicorp":"fechamento no CRM")+". Não são recebimentos.");
  if(s.campaignIds?.length) footer.push("Recorte: campanhas selecionadas pelo gestor.");
  const message=body+"\n\n"+footer.join("\n");
  if(message.length>12000)throw new Error("Relatório excede 12.000 caracteres. Reduza o texto ou a quantidade de campanhas.");
  return message;
}
function validDate(date: unknown): date is string {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + "T12:00:00Z")) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date
  );
}
export const metricTokens: Record<Metric, string> = {
  leads: "leads_reais",
  scheduled: "agendamentos",
  attended: "comparecimentos",
  sales: "vendas",
  revenue: "faturamento",
  spend: "investimento",
  impressions: "impressoes",
  clicks: "cliques",
  ctr: "ctr",
  cpl: "cpl",
  cpc: "cpc",
  cpm: "cpm",
};
export const crmMetrics: Metric[] = [
  "leads",
  "scheduled",
  "attended",
  "sales",
  "revenue",
  "cpl",
];
const normalizeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
const tokenAliases: Record<string, string> = {
  meta_ads: "investimento",
  leads_reais_voxi: "leads_reais",
  lead: "leads_reais",
  leads: "leads_reais",
  valor_investido: "investimento",
  valor_vendido: "faturamento",
};
const tokenName = (value: string) =>
  tokenAliases[normalizeToken(value)] || normalizeToken(value);
export function unknownTokens(template: string) {
  const known = new Set([
    ...Object.values(metricTokens),
    "cliente",
    "periodo",
    "titulo",
    "abertura",
    "melhores_anuncios",
    "campanhas",
  ]);
  return [
    ...new Set(
      [...template.matchAll(/{{\s*([^{}]+)\s*}}/g)]
        .filter((m) => !known.has(tokenName(m[1])))
        .map((m) => m[1].trim()),
    ),
  ];
}
export function templateFromSettings(s: ReportSettings) {
  return (
    "*NEWVOX | {{titulo}}*\n*{{cliente}}*\n{{periodo}}\n\n{{abertura}}\n\n" +
    s.metrics
      .map((m) => "• " + metricLabels[m] + ": {{" + metricTokens[m] + "}}")
      .join("\n") +
    (s.includeCampaigns ? "\n\n{{campanhas}}" : "") +
    (s.includeAds ? "\n\n{{melhores_anuncios}}" : "")
  );
}
export function renderTemplate(template:string,name:string,s:ReportSettings,result:any) {
  const unselected=templateMetrics(template).filter(m=>!s.metrics.includes(m));
  if(unselected.length) throw new Error("A mensagem contém métricas desmarcadas. Revise as variáveis.");
  const values:Record<string,string>={
    cliente:name.replace(/[\r\n]/g," "),periodo:result.period.startDate+" a "+result.period.endDate+" · "+s.timezone,
    titulo:s.title,abertura:s.intro,
    campanhas:s.includeCampaigns&&result.campaigns?.length?"*Campanhas do período*\n"+campaignText(result.campaigns,s):"",
    melhores_anuncios:adHighlights(s,result),
  };
  for(const metric of s.metrics) values[metricTokens[metric]]=metricValue(metric,result.metrics[metric]);
  return template.replace(/{{\s*([^{}]+)\s*}}/g,(_,key)=>values[tokenName(key)]??"Indisponível");
}
export function templateMetrics(template: string): Metric[] {
  const tokens = new Set(
    [...template.matchAll(/{{\s*([^{}]+)\s*}}/g)].map((m) => tokenName(m[1])),
  );
  return (Object.keys(metricTokens) as Metric[]).filter((m) =>
    tokens.has(metricTokens[m]),
  );
}
function campaignText(campaigns:any[],s:ReportSettings) {
  const metrics=s.metrics.filter(m=>["spend","clicks","impressions","ctr","cpc","cpm"].includes(m));
  return campaigns.map(c=>"• "+c.name+"\n  "+metrics.map(m=>metricLabels[m]+": "+metricValue(m,c[m])).join(" · ")).join("\n");
}
