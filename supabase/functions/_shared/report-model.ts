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
};
export type Metric = keyof typeof metricLabels;
export type ReportSettings = {
  title: string;
  intro: string;
  metrics: Metric[];
  pipelines: string[];
  stages: { scheduled: string[]; attended: string[] };
  period: "yesterday" | "last7" | "last30" | "previousMonth";
  frequency: "daily" | "weekly" | "monthly";
  weekdays: number[];
  monthDay: number;
  time: string;
  timezone: string;
  ranking: "leads" | "sales" | "cpl";
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
    s.metrics.some((m) => !(m in metricLabels)) ||
    !ids(s.pipelines) ||
    !s.stages ||
    !ids(s.stages.scheduled) ||
    !ids(s.stages.attended) ||
    !["yesterday", "last7", "last30", "previousMonth"].includes(s.period) ||
    !["daily", "weekly", "monthly"].includes(s.frequency) ||
    !Array.isArray(s.weekdays) ||
    !s.weekdays.length ||
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
    !["leads", "sales", "cpl"].includes(s.ranking) ||
    !Number.isInteger(s.top) ||
    s.top < 1 ||
    s.top > 5 ||
    !Number.isInteger(s.minLeads) ||
    s.minLeads < 1 ||
    s.minLeads > 1000 ||
    typeof s.includeAds !== "boolean"
  )
    throw new Error("Revise os campos do relatório.");
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
          : ["revenue", "spend", "cpl"].includes(metric)
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
          ad.leads +
          " leads reais · " +
          ad.sales +
          " vendas" +
          (ad.cpl !== null ? " · CPL " + brl(ad.cpl) : ""),
      );
      if (ad.url) lines.push(ad.url);
    }
  }
  if (result.warnings?.length)
    lines.push(
      "",
      "*Observações*",
      ...result.warnings.map((w: string) => "• " + w),
    );
  lines.push(
    "",
    "Dados comerciais: Voxi · Mídia: Meta",
    "Vendas são valor vendido, não recebimentos. Etapas mostram avanço no período, não a posição atual.",
  );
  return lines.join("\n").slice(0, 12000);
}
