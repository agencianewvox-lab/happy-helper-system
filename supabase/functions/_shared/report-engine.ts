import { VoxiReader, inIds, deriveScope } from "./voxi-reader.ts";
import { closedSales, verifiedSalesTotals } from "./report-sales.ts";
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
  const won = [...new Map(opportunities.map(o => [o.id,o])).values()].filter(
    (o) =>
      o.status === "won" && inPeriod(o.won_at) &&
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
export async function metaCampaignCatalog(account: string, key: string) {
  const normalized = account.startsWith("act_") ? account : "act_" + account;
  if (!/^act_\d+$/.test(normalized) || !key)
    throw new Error("Conta Meta não configurada.");
  const data: any[] = [];
  let after = "";
  for (let i = 0; i < 100; i++) {
    const url = new URL(
      "https://graph.facebook.com/v21.0/" + normalized + "/campaigns",
    );
    url.searchParams.set("fields", "id,name,effective_status");
    url.searchParams.set("limit", "500");
    if (after) url.searchParams.set("after", after);
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.data))
      throw new Error(
        "Não foi possível carregar as campanhas desta conta Meta.",
      );
    data.push(...body.data);
    if (!body.paging?.next) return data;
    after = body.paging?.cursors?.after;
    if (!after) throw new Error("Paginação de campanhas incompleta.");
  }
  throw new Error("Volume de campanhas excede o limite seguro.");
}
async function metaRead(
  account: string,
  period: any,
  key: string,
  campaignIds: string[] = [],
) {
  account = account.startsWith("act_") ? account : "act_" + account;
  if (!/^act_\d+$/.test(account)) throw new Error("Conta Meta não vinculada.");
  if (!key) throw new Error("Meta não configurada.");
  const headers = { Authorization: "Bearer " + key };
  if (campaignIds.length) {
    const catalog = await metaCampaignCatalog(account, key);
    if (campaignIds.some((id) => !catalog.some((c) => c.id === id)))
      throw new Error(
        "Uma campanha selecionada não pertence mais à conta Meta vinculada. Revise a seleção.",
      );
  }
  const info = await fetch(
    "https://graph.facebook.com/v21.0/" +
      account +
      "?fields=name,currency,timezone_name",
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
      "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks",
    );
    u.searchParams.set("level", "ad");
    u.searchParams.set("limit", "500");
    if (campaignIds.length)
      u.searchParams.set(
        "filtering",
        JSON.stringify([
          { field: "campaign.id", operator: "IN", value: campaignIds },
        ]),
      );
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
  const metaOnly = s.dataMode === "meta";
  const needsSales = !metaOnly && s.metrics.some(m => m === "sales" || m === "revenue");
  let saleData: ReturnType<typeof closedSales> | null = null;
  let saleError: string | null = null;
  let commercial: any = {
    metrics: {
      leads: null,
      scheduled: null,
      attended: null,
      sales: null,
      revenue: null,
    },
    ads: [],
    attributedEntries: [],
    warnings: [],
  };
  if (!metaOnly) {
    if (!source) throw new Error("Vincule o CRM ou escolha o modo só Meta.");
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
      needsSales ? reader.read("opportunities", { ...filters, won_at: "gte." + period.start }) : [],
      reader.read("journey_stages", filters),
    ]);
    let history: any[] = [];
    if (
      s.metrics.some((m) => m === "scheduled" || m === "attended") ||
      /{{\s*(agendamentos|comparecimentos)\s*}}/i.test(s.template || "")
    ) {
      for (let i = 0; i < leads.length; i += 150)
        history.push(
          ...(await reader.read("stage_history", {
            lead_id: inIds(leads.slice(i, i + 150).map((l) => l.id)),
            changed_at: "gte." + period.start,
          })),
        );
    }
    if (needsSales) {
      try {
        const [connections, events] = await Promise.all([reader.read("clinicorp_connections",filters),reader.read("acquisition_events",filters)]);
        const budgets = connections.length ? await reader.read("clinicorp_budget_opportunities",filters) : [];
        saleData=closedSales({instances:source.instance_ids,connections,budgets,opportunities:opps,leads,events,pipelines:s.pipelines,period,now});
      } catch { saleError="Fonte comercial indisponível. Vendas não foram convertidas em zero."; }
    }
    commercial = aggregateCommercial(
      leads,
      links,
      contacts,
      opps,
      history,
      stages,
      s,
      period,
    );
  }
  const result: any = {
    period,
    metrics: {
      ...commercial.metrics,
      spend: null,
      impressions: null,
      clicks: null,
      ctr: null,
      cpl: null,
      cpc: null,
      cpm: null,
    },
    ads: [],
    warnings: [...commercial.warnings, ...(saleData?.warnings || []), ...(saleError ? [saleError] : [])],
    blockingReasons: saleError ? [saleError] : [],
    salesSource: saleData?.source || null,
    salesAudit: saleData ? {excludedAttribution:saleData.excludedAttribution,excludedPipeline:saleData.excludedPipeline,missingDate:saleData.missingDate} : null,
  };
  // The legacy aggregate is used for lead/stage counts, never for sales totals.
  result.metrics.sales = null; result.metrics.revenue = null;
  for (const ad of commercial.ads) ad.sales = 0;
  if(needsSales && saleData && !saleData.available) result.blockingReasons.push("Revise a sincronização/datas do Clinicorp antes de enviar vendas.");
  try {
    if (!account) throw new Error("Conta de anúncios ainda não vinculada.");
    const meta = await metaRead(account, period, metaKey, s.campaignIds || []);
    result.metaAccountName = meta.name || null;
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
      cpc: totals.clicks ? totals.spend / totals.clicks : null,
      cpm: totals.impressions
        ? (1000 * totals.spend) / totals.impressions
        : null,
    });
    const sameZone = meta.timezone_name === s.timezone;
    const verified = new Map<string, any>(meta.data.map((a: any) => [a.ad_id, a]));
    // Ownership is checked independently of period spend, so historical ads remain eligible.
    const details = await metaAdDetails([...new Set<string>([
      ...(saleData?.sales.map(x=>x.adId)||[]),
      ...commercial.ads.map((x:any)=>x.id),
      ...(s.includeAds ? meta.data.map((x:any)=>x.ad_id) : []),
    ])], metaKey);
    const accountId = account.replace(/^act_/,"");
    const belongs = (ad:any) => ad.account_id === accountId && (!s.campaignIds?.length || s.campaignIds.includes(ad.campaign_id));
    for(const [id,ad] of details) if(belongs(ad)) verified.set(id,{ad_id:id,ad_name:ad.name,campaign_id:ad.campaign_id,spend:0,impressions:0,inline_link_clicks:0,...verified.get(id),url:ad.url});
    if(needsSales && saleData?.available) {
      const totals = verifiedSalesTotals(saleData.sales,details,account,s.campaignIds||[]);
      result.metrics.sales=totals.sales; result.metrics.revenue=totals.revenue;
      Object.assign(result.salesAudit,{excludedAccount:totals.excludedAccount,excludedCampaign:totals.excludedCampaign});
      if(totals.excludedAccount) result.warnings.push(totals.excludedAccount+" venda(s) excluída(s): anúncio sem pertencimento comprovado à conta Meta.");
      for(const a of totals.byAd) {
        const existing=commercial.ads.find((x:any)=>x.id===a.id);
        if(existing) existing.sales=a.sales; else commercial.ads.push({id:a.id,leads:0,sales:a.sales});
      }
    }
    const actualMetaLeads = new Set(
      commercial.attributedEntries
        .filter((l: any) => verified.has(l.adId))
        .map((l: any) => l.identity),
    ).size;
    result.metrics.cpl =
      sameZone && actualMetaLeads ? totals.spend / actualMetaLeads : null;
    if (!sameZone)
      result.warnings.push(
        "Fuso da conta Meta difere do relatório. CPL não é calculado entre períodos desalinhados.",
      );
    const metaRanking = ["clicks", "spend", "ctr", "cpc"].includes(s.ranking);
    result.ads = (
      metaOnly || metaRanking
        ? meta.data.map((m: any) => ({
            id: m.ad_id,
            leads:
              commercial.ads.find((a: any) => a.id === m.ad_id)?.leads ?? 0,
            sales:
              commercial.ads.find((a: any) => a.id === m.ad_id)?.sales ?? 0,
          }))
        : commercial.ads
    )
      .filter(
        (a: any) =>
          verified.has(a.id) &&
          (metaOnly || metaRanking || s.ranking === "sales" ? (s.ranking !== "sales" || a.sales > 0) : a.leads >= s.minLeads),
      )
      .map((a: any) => {
        const m: any = verified.get(a.id);
        return {
          ...a,
          name: m.ad_name,
          spend: Number(m.spend || 0),
          clicks: Number(m.inline_link_clicks || 0),
          impressions: Number(m.impressions || 0),
          ctr: Number(m.impressions || 0)
            ? (100 * Number(m.inline_link_clicks || 0)) / Number(m.impressions)
            : 0,
          cpc: Number(m.inline_link_clicks || 0)
            ? Number(m.spend || 0) / Number(m.inline_link_clicks)
            : null,
          cpl: sameZone && a.leads ? Number(m.spend || 0) / a.leads : null,
          url: m.url || details.get(a.id)?.url || null,
        };
      })
      .filter(
        (a: any) =>
          a.clicks >= (s.minClicks || 0) &&
          a.impressions >= (s.minImpressions || 0) &&
          (s.ranking !== "cpl" || a.cpl !== null) &&
          (s.ranking !== "cpc" || a.cpc !== null),
      )
      .sort((a: any, b: any) =>
        ["cpl", "cpc"].includes(s.ranking)
          ? a[s.ranking] - b[s.ranking]
          : b[s.ranking] - a[s.ranking] || a.id.localeCompare(b.id),
      )
      .slice(0, s.top);
    if(s.includeAds && result.ads.some((a:any)=>!a.url)) result.warnings.push("A Meta não disponibilizou link válido para um ou mais destaques. O nome e o resultado serão enviados sem link.");
    const campaigns = new Map<string, any>();
    for (const row of meta.data) {
      const c = campaigns.get(row.campaign_id) || {
        id: row.campaign_id,
        name: row.campaign_name,
        spend: 0,
        clicks: 0,
        impressions: 0,
      };
      c.spend += Number(row.spend || 0);
      c.clicks += Number(row.inline_link_clicks || 0);
      c.impressions += Number(row.impressions || 0);
      campaigns.set(c.id, c);
    }
    result.campaigns = [...campaigns.values()]
      .map((c) => ({
        ...c,
        ctr: c.impressions ? (100 * c.clicks) / c.impressions : 0,
        cpc: c.clicks ? c.spend/c.clicks : null,
        cpm: c.impressions ? 1000*c.spend/c.impressions : null,
      }))
      .sort((a, b) => b.spend - a.spend);
  } catch (e) {
    result.metrics.sales = null; result.metrics.revenue = null;
    result.blockingReasons.push("Consulta Meta incompleta. Atualize a prévia antes de enviar.");
    result.warnings.push(e instanceof Error ? e.message : "Meta indisponível.");
  }
  if(needsSales && (result.metrics.sales === null || (s.metrics.includes("revenue") && result.metrics.revenue === null))) result.blockingReasons.push("Vendas ou valores indisponíveis. Revise os avisos internos.");
  result.dataMode = metaOnly ? "meta" : "crm_meta";
  return result;
}
export async function metaAdDetails(ids:string[],key:string): Promise<Map<string,any>> {
  const unique=[...new Set(ids)].filter(id=>/^\d{1,30}$/.test(id));
  const out=new Map<string,any>();
  for(let i=0;i<unique.length;i+=50) {
    const url=new URL("https://graph.facebook.com/v21.0/");
    url.searchParams.set("ids",unique.slice(i,i+50).join(","));
    url.searchParams.set("fields","id,name,account_id,campaign_id,preview_shareable_link,creative{instagram_permalink_url}");
    const response=await fetch(url,{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(20000)});
    const body=await response.json();
    if(!response.ok || body.error) throw new Error("Não foi possível verificar os anúncios na Meta.");
    for(const id of unique.slice(i,i+50)) {
      const ad=body[id];if(!ad || ad.error || ad.id!==id || !ad.account_id)continue;
      const link=[ad.creative?.instagram_permalink_url,ad.preview_shareable_link].find(value=>{
        try{const u=new URL(value);return u.protocol==="https:" && ["facebook.com","www.facebook.com","fb.me","instagram.com","www.instagram.com"].includes(u.hostname);}catch{return false;}
      });
      out.set(id,{...ad,url:link || null});
    }
  }
  return out;
}
