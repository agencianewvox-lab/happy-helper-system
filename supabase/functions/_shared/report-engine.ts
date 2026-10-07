import { VoxiReader, inIds, deriveScope } from "./voxi-reader.ts";
import { ReportSettings, reportPeriod } from "./report-model.ts";
export function aggregateCommercial(
  leads: any[],
  links: any[],
  contacts: any[],
  opportunities: any[],
  history: any[],
  stages: any[],
  s: ReportSettings,
  period: any,
) {
  const warnings: string[] = [];
  const inPeriod = (date: string) =>
    !!date &&
    Date.parse(date) >= Date.parse(period.start) &&
    Date.parse(date) < Date.parse(period.end);
  const selected = leads.filter(
    (l) => !s.pipelines.length || s.pipelines.includes(l.pipeline_id),
  );
  if (s.pipelines.length && leads.some((l) => !l.pipeline_id))
    warnings.push(
      "Registros sem funil identificado foram excluídos do filtro de funil.",
    );
  const leadSet = new Set(selected.map((l) => l.id));
  const merged = new Map(contacts.map((c) => [c.id, c.merged_into_id]));
  const canonical = (id: string) => {
    const seen = new Set<string>();
    let cur = id;
    while (merged.get(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = merged.get(cur);
    }
    return cur;
  };
  const identities = new Map<string, Set<string>>();
  for (const link of links) {
    const ids = identities.get(link.lead_id) || new Set<string>();
    ids.add(canonical(link.contact_id));
    identities.set(link.lead_id, ids);
  }
  const identity = (id: string) => {
    const ids = identities.get(id);
    return ids?.size === 1 ? "contact:" + [...ids][0] : "lead:" + id;
  };
  const entered = selected.filter((l) => inPeriod(l.lead_entered_at));
  const realLeads = new Set(entered.map((l) => identity(l.id)));
  if (entered.some((l) => identities.get(l.id)?.size !== 1))
    warnings.push(
      "Leads sem identidade canônica são contados pelo registro CRM; duplicidades antigas podem permanecer.",
    );
  const ads = new Map<
    string,
    { id: string; leads: Set<string>; sales: Set<string> }
  >();
  const ad = (id: string) => {
    if (!ads.has(id)) ads.set(id, { id, leads: new Set(), sales: new Set() });
    return ads.get(id)!;
  };
  const leadAds = new Map(selected.map((l) => [l.id, l.ad_id]));
  for (const l of entered) if (l.ad_id) ad(l.ad_id).leads.add(identity(l.id));
  const won = opportunities.filter(
    (o) =>
      inPeriod(o.won_at) &&
      (!s.pipelines.length || s.pipelines.includes(o.pipeline_id)),
  );
  for (const o of won) {
    const aid = leadAds.get(o.lead_id);
    if (aid) ad(aid).sales.add(o.id);
  }
  const stageCount = (stageIds: string[]) => {
    if (!stageIds.length) return null;
    const chosen = stages.filter((x) => stageIds.includes(x.id));
    if (chosen.length !== stageIds.length) {
      warnings.push("Uma etapa configurada não existe mais no CRM.");
      return null;
    }
    const names = new Set(chosen.map((x) => x.name));
    // Historical source has names, not stage IDs. Never guess by partial text.
    if (
      [...names].some(
        (name) =>
          stages.filter(
            (x) =>
              x.name === name &&
              (!s.pipelines.length || s.pipelines.includes(x.pipeline_id)),
          ).length !== 1,
      )
    ) {
      warnings.push(
        "Etapas com nomes repetidos: histórico não permite identificar o funil com segurança.",
      );
      return null;
    }
    return new Set(
      history
        .filter(
          (h) =>
            leadSet.has(h.lead_id) &&
            names.has(h.to_stage) &&
            inPeriod(h.changed_at),
        )
        .map((h) => identity(h.lead_id)),
    ).size;
  };
  const metaLeads = new Set(
    entered.filter((l) => !!l.ad_id).map((l) => identity(l.id)),
  );
  const revenue = won.every(
    (o) => o.value !== null && Number.isFinite(Number(o.value)),
  )
    ? won.reduce((n, o) => n + Number(o.value), 0)
    : null;
  if (revenue === null)
    warnings.push("Algumas vendas não têm valor preenchido.");
  const unattributed = entered.filter((l) => !l.ad_id).length;
  if (unattributed)
    warnings.push(
      unattributed +
        " registros de entrada sem ad_id; não entram no ranking nem no custo por lead Meta.",
    );
  return {
    metrics: {
      leads: realLeads.size,
      scheduled: stageCount(s.stages.scheduled),
      attended: stageCount(s.stages.attended),
      sales: won.length,
      revenue,
    },
    metaLeadCount: metaLeads.size,
    attributedEntries: entered
      .filter((l) => !!l.ad_id)
      .map((l) => ({ adId: l.ad_id, identity: identity(l.id) })),
    ads: [...ads.values()].map((a) => ({
      id: a.id,
      leads: a.leads.size,
      sales: a.sales.size,
    })),
    warnings,
  };
}
async function metaRead(account: string, period: any, key: string) {
  account = account.startsWith("act_") ? account : "act_" + account;
  if (!/^act_\d+$/.test(account)) throw new Error("Conta Meta não vinculada.");
  if (!key) throw new Error("Meta não configurada.");
  const headers = { Authorization: "Bearer " + key };
  const info = await fetch(
    "https://graph.facebook.com/v21.0/" +
      account +
      "?fields=currency,timezone_name",
    { headers, signal: AbortSignal.timeout(20000) },
  );
  const accountData = await info.json();
  if (!info.ok) throw new Error("Meta indisponível (" + info.status + ").");
  let after = "",
    data: any[] = [];
  for (let i = 0; i < 100; i++) {
    const u = new URL(
      "https://graph.facebook.com/v21.0/" + account + "/insights",
    );
    u.searchParams.set(
      "fields",
      "ad_id,ad_name,spend,impressions,inline_link_clicks",
    );
    u.searchParams.set("level", "ad");
    u.searchParams.set("limit", "500");
    u.searchParams.set(
      "time_range",
      JSON.stringify({ since: period.startDate, until: period.endDate }),
    );
    if (after) u.searchParams.set("after", after);
    const r = await fetch(u, { headers, signal: AbortSignal.timeout(20000) }),
      b = await r.json();
    if (!r.ok || !Array.isArray(b.data))
      throw new Error("Não foi possível consultar os anúncios.");
    data.push(...b.data);
    if (!b.paging?.next) return { data, ...accountData };
    after = b.paging?.cursors?.after;
    if (!after) throw new Error("Paginação Meta incompleta.");
  }
  throw new Error("Volume Meta excedeu a consulta segura.");
}
export async function collectReport(
  reader: VoxiReader,
  source: any,
  s: ReportSettings,
  account: string | null,
  now = new Date(),
  metaKey = "",
) {
  const period = reportPeriod(s, now);
  const instances = await reader.read("whatsapp_instances"),
    scope = deriveScope(source.crm_account_id, instances);
  if (
    JSON.stringify([...scope.ids].sort()) !==
    JSON.stringify([...source.instance_ids].sort())
  )
    throw new Error(
      "Escopo do CRM mudou. O Master precisa confirmar o vínculo novamente.",
    );
  const filters = { whatsapp_instance_id: inIds(source.instance_ids) };
  const [leads, links, contacts, opps, stages] = await Promise.all([
    reader.read("leads", filters),
    reader.read("lead_identity_links", filters),
    reader.read("contacts", filters),
    reader.read("opportunities", { ...filters, won_at: "gte." + period.start }),
    reader.read("journey_stages", filters),
  ]);
  let history: any[] = [];
  if (s.metrics.some((m) => m === "scheduled" || m === "attended")) {
    for (let i = 0; i < leads.length; i += 150)
      history.push(
        ...(await reader.read("stage_history", {
          lead_id: inIds(leads.slice(i, i + 150).map((l) => l.id)),
          changed_at: "gte." + period.start,
        })),
      );
  }
  const commercial = aggregateCommercial(
    leads,
    links,
    contacts,
    opps,
    history,
    stages,
    s,
    period,
  );
  const result: any = {
    period,
    metrics: {
      ...commercial.metrics,
      spend: null,
      impressions: null,
      clicks: null,
      ctr: null,
      cpl: null,
    },
    ads: [],
    warnings: commercial.warnings,
  };
  try {
    if (!account) throw new Error("Conta de anúncios ainda não vinculada.");
    const meta = await metaRead(account, period, metaKey);
    if (meta.currency !== "BRL")
      throw new Error(
        "Conta Meta não está em BRL; valores de moedas diferentes não serão somados.",
      );
    const totals = meta.data.reduce(
      (a: any, d: any) => ({
        spend: a.spend + Number(d.spend || 0),
        impressions: a.impressions + Number(d.impressions || 0),
        clicks: a.clicks + Number(d.inline_link_clicks || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0 },
    );
    Object.assign(result.metrics, totals, {
      ctr: totals.impressions ? (100 * totals.clicks) / totals.impressions : 0,
    });
    const sameZone = meta.timezone_name === s.timezone;
    const verified = new Map(meta.data.map((a: any) => [a.ad_id, a]));
    const actualMetaLeads = new Set(
      commercial.attributedEntries
        .filter((l) => verified.has(l.adId))
        .map((l) => l.identity),
    ).size;
    result.metrics.cpl =
      sameZone && actualMetaLeads ? totals.spend / actualMetaLeads : null;
    if (!sameZone)
      result.warnings.push(
        "Fuso da conta Meta difere do relatório. CPL não é calculado entre períodos desalinhados.",
      );
    result.ads = commercial.ads
      .filter((a) => verified.has(a.id) && a.leads >= s.minLeads)
      .map((a) => {
        const m: any = verified.get(a.id);
        return {
          ...a,
          name: m.ad_name,
          spend: Number(m.spend || 0),
          cpl: sameZone ? Number(m.spend || 0) / a.leads : null,
          url: null,
        };
      })
      .filter((a: any) => s.ranking !== "cpl" || a.cpl !== null)
      .sort((a: any, b: any) =>
        s.ranking === "cpl"
          ? a.cpl - b.cpl
          : s.ranking === "sales"
            ? b.sales - a.sales
            : b.leads - a.leads,
      )
      .slice(0, s.top);
  } catch (e) {
    result.warnings.push(e instanceof Error ? e.message : "Meta indisponível.");
  }
  return result;
}
