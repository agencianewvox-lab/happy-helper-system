export const metricLabels = {
  leads: "Leads reais · CRM",
  scheduled: "Pessoas que avançaram para agendamento",
  attended: "Pessoas que avançaram para comparecimento",
  sales: "Vendas registradas · CRM",
  revenue: "Valor vendido · CRM",
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
  metrics: ["leads", "scheduled", "attended", "sales", "spend", "cpl"],
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
  if (s.template?.trim()) {
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
  if (diff < 0 || diff > 180) return null;
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
export function renderReport(
  name: string,
  s: ReportSettings,
  result: any,
): string {
  const brl = (n: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  const lines = [
    "*NEWVOX | " + s.title + "*",
    "*" + name.replace(/[\r\n]/g, " ") + "*",
    result.period.startDate +
      " a " +
      result.period.endDate +
      " · " +
      s.timezone,
    "",
    s.intro,
    "",
  ];
  for (const metric of s.metrics) {
    const n = result.metrics[metric];
    lines.push(
      "• " +
        metricLabels[metric] +
        ": " +
        (n === null || n === undefined
          ? "N/D"
          : ["revenue", "spend", "cpl", "cpc", "cpm"].includes(metric)
            ? brl(n)
            : metric === "ctr"
              ? n.toFixed(2) + "%"
              : n.toLocaleString("pt-BR")),
    );
  }
  if (s.includeAds && result.ads?.length) {
    lines.push("", "*Destaques dos anúncios*");
    for (const [i, ad] of result.ads.entries()) {
      lines.push(
        i +
          1 +
          ". " +
          ad.name +
          " · " +
          (s.dataMode === "meta"
            ? ad.clicks + " cliques · " + brl(ad.spend) + " investidos"
            : ad.leads +
              " leads reais · " +
              ad.sales +
              " vendas" +
              (ad.cpl !== null ? " · CPL " + brl(ad.cpl) : "")),
      );
      if (ad.url) lines.push(ad.url);
    }
  }
  if (s.includeCampaigns && result.campaigns?.length)
    lines.push("", "*Campanhas do período*", campaignText(result.campaigns));
  if (result.warnings?.length)
    lines.push(
      "",
      "*Observações*",
      ...result.warnings.map((w: string) => "• " + w),
    );
  const body = s.template?.trim()
    ? renderTemplate(s.template, name, s, result)
    : lines.join("\n");
  const footer = [
    "",
    s.dataMode === "meta"
      ? "Fonte: Meta Ads · Sem dados de CRM"
      : "Dados comerciais: Voxi · Mídia: Meta",
    s.dataMode === "meta"
      ? "Cliques e impressões não equivalem a leads reais ou vendas."
      : "Vendas: oportunidades ganhas no CRM. Etapas mostram avanço no período, não a posição atual.",
  ];
  if (s.template?.trim() && result.warnings?.length)
    footer.unshift(
      "",
      "*Observações*",
      ...result.warnings.map((w: string) => "• " + w),
    );
  if (s.campaignIds?.length)
    footer.push(
      "Mídia limitada a " +
        s.campaignIds.length +
        " campanha(s) selecionada(s)." +
        (s.dataMode === "meta"
          ? ""
          : " Dados comerciais são da conta CRM inteira, salvo filtro de funil."),
    );
  const message = body + "\n" + footer.join("\n");
  if (message.length > 12000)
    throw new Error(
      "Relatório excede 12.000 caracteres. Reduza o texto ou a quantidade de campanhas.",
    );
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
export function renderTemplate(
  template: string,
  name: string,
  s: ReportSettings,
  result: any,
) {
  const money = (n: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  const values: Record<string, string> = {
    cliente: name.replace(/[\r\n]/g, " "),
    periodo:
      result.period.startDate +
      " a " +
      result.period.endDate +
      " · " +
      s.timezone,
    titulo: s.title,
    abertura: s.intro,
    campanhas:
      s.includeCampaigns && result.campaigns?.length
        ? "*Campanhas do período*\n" + campaignText(result.campaigns)
        : "",
    melhores_anuncios:
      s.includeAds && result.ads?.length
        ? "*Destaques dos anúncios*\n" +
          result.ads
            .map(
              (ad: any, i: number) =>
                i +
                1 +
                ". " +
                ad.name +
                " · " +
                (s.dataMode === "meta"
                  ? ad.clicks + " cliques · " + money(ad.spend) + " investidos"
                  : ad.leads +
                    " leads reais · " +
                    ad.sales +
                    " vendas" +
                    (ad.cpl != null ? " · CPL " + money(ad.cpl) : "")),
            )
            .join("\n")
        : "",
  };
  for (const [metric, token] of Object.entries(metricTokens)) {
    const n = result.metrics[metric];
    values[token] =
      n == null || !Number.isFinite(n)
        ? "N/D"
        : ["revenue", "spend", "cpl", "cpc", "cpm"].includes(metric)
          ? money(n)
          : metric === "ctr"
            ? n.toFixed(2) + "%"
            : n.toLocaleString("pt-BR");
  }
  return template.replace(
    /{{\s*([^{}]+)\s*}}/g,
    (_, key) => values[tokenName(key)] ?? "N/D",
  );
}
export function templateMetrics(template: string): Metric[] {
  const tokens = new Set(
    [...template.matchAll(/{{\s*([^{}]+)\s*}}/g)].map((m) => tokenName(m[1])),
  );
  return (Object.keys(metricTokens) as Metric[]).filter((m) =>
    tokens.has(metricTokens[m]),
  );
}
function campaignText(campaigns: any[]) {
  const money = (n: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  return campaigns
    .map(
      (c: any) =>
        "• " +
        c.name +
        "\n  Investimento: " +
        money(c.spend) +
        " · Cliques: " +
        c.clicks.toLocaleString("pt-BR") +
        " · Impressões: " +
        c.impressions.toLocaleString("pt-BR") +
        " · CTR: " +
        c.ctr.toFixed(2) +
        "%",
    )
    .join("\n");
}
