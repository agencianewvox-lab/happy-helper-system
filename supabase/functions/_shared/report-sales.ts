/** Read-only, explicit business identity; never joins by patient name or phone. */
export type ClosedSale = {
  id: string;
  adId: string;
  value: number | null;
  closedAt: string;
};
type Row = Record<string, any>;
export function closedSales(input: {
  instances: string[];
  connections: Row[];
  budgets: Row[];
  opportunities: Row[];
  leads: Row[];
  events: Row[];
  pipelines: string[];
  period: { start: string; end: string };
  now: Date;
}) {
  const scope = new Set(input.instances);
  const connections = input.connections.filter((c) =>
    scope.has(c.whatsapp_instance_id),
  );
  const source = connections.length ? "clinicorp" : "opportunities";
  const warnings: string[] = [];
  const requiredSync = Math.min(
    Date.parse(input.period.end),
    +input.now - 24 * 3600000,
  );
  const unavailable = connections.some((c) => {
    const stamp =
      c.integration_mode === "webhook" ? c.last_webhook_at : c.last_synced_at;
    return (
      !c.enabled ||
      !stamp ||
      Date.parse(stamp) < requiredSync ||
      (c.integration_mode !== "webhook" && c.last_status !== "ok")
    );
  });
  if (unavailable)
    warnings.push(
      "Clinicorp sem sincronização suficiente ou com erro. Última sincronização: " +
        connections
          .map((c) => c.last_synced_at || c.last_webhook_at || "não informada")
          .join(", ") +
        ". Vendas e valor vendido estão indisponíveis; o zero exibido por uma tela não comprova ausência de vendas. Não foram substituídos por oportunidades.",
    );
  const leadMap = new Map(
    input.leads
      .filter((l) => scope.has(l.whatsapp_instance_id))
      .map((l) => [l.id, l]),
  );
  const verifiedEvents = input.events.filter(
    (e) =>
      scope.has(e.whatsapp_instance_id) &&
      e.provider === "META" &&
      e.attribution_status === "VERIFIED" &&
      /^\d{1,30}$/.test(e.ad_id || ""),
  );
  const inPeriod = (date: unknown) =>
    typeof date === "string" &&
    Date.parse(date) >= Date.parse(input.period.start) &&
    Date.parse(date) < Date.parse(input.period.end);
  const connectionIds = new Set(connections.map((c) => c.id));
  const candidates =
    source === "clinicorp"
      ? input.budgets.filter(
          (b) =>
            scope.has(b.whatsapp_instance_id) &&
            connectionIds.has(b.connection_id) &&
            b.clinicorp_budget_status === "APPROVED" &&
            inPeriod(b.approved_at),
        )
      : input.opportunities.filter(
          (o) =>
            scope.has(o.whatsapp_instance_id) &&
            o.status === "won" &&
            inPeriod(o.won_at),
        );
  const seen = new Set<string>(),
    sales: ClosedSale[] = [];
  let excludedAttribution = 0,
    excludedPipeline = 0,
    missingDate = 0;
  if (source === "clinicorp")
    missingDate = input.budgets.filter(
      (b) =>
        connectionIds.has(b.connection_id) &&
        b.clinicorp_budget_status === "APPROVED" &&
        !b.approved_at &&
        inPeriod(b.closed_at),
    ).length;
  for (const row of candidates) {
    const id =
      source === "clinicorp"
        ? row.connection_id + ":" + row.clinicorp_budget_id
        : row.id;
    if (!id || (source === "clinicorp" && !row.clinicorp_budget_id)) {
      excludedAttribution++;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const lead = leadMap.get(row.lead_id);
    if (
      input.pipelines.length &&
      !input.pipelines.includes(
        source === "clinicorp" ? lead?.pipeline_id : row.pipeline_id,
      )
    ) {
      excludedPipeline++;
      continue;
    }
    const closedAt = source === "clinicorp" ? row.approved_at : row.won_at;
    // An event must name this exact opportunity or lead and predate closing.
    // Contact-only joins are intentionally not used: one contact can have several deals.
    const direct =
      source === "opportunities"
        ? verifiedEvents.filter(
            (e) =>
              e.opportunity_id === row.id &&
              Date.parse(e.occurred_at) <= Date.parse(closedAt),
          )
        : [];
    const events = direct.length
      ? direct
      : verifiedEvents.filter(
          (e) =>
            e.lead_id &&
            e.lead_id === row.lead_id &&
            Date.parse(e.occurred_at) <= Date.parse(closedAt),
        );
    const adIds = new Set(events.map((e) => e.ad_id));
    if (adIds.size !== 1) {
      excludedAttribution++;
      continue;
    }
    const rawValue = source === "clinicorp" ? row.budget_amount : row.value;
    const value =
      rawValue != null &&
      Number.isFinite(Number(rawValue)) &&
      Number(rawValue) >= 0
        ? Number(rawValue)
        : null;
    sales.push({ id, adId: [...adIds][0], value, closedAt });
  }
  if (excludedAttribution)
    warnings.push(
      `${excludedAttribution} venda(s) excluída(s): atribuição Meta não comprovada ou ambígua.`,
    );
  if (excludedPipeline)
    warnings.push(`${excludedPipeline} venda(s) fora dos funis selecionados.`);
  if (missingDate)
    warnings.push(
      `${missingDate} orçamento(s) sem data de aprovação, com fechamento no período. Totais indisponíveis até corrigir a origem.`,
    );
  return {
    source,
    available: !unavailable && missingDate === 0,
    sales,
    warnings,
    excludedAttribution,
    excludedPipeline,
    missingDate,
  };
}

export function verifiedSalesTotals(
  sales: ClosedSale[],
  ads: Map<string, { account_id: string; campaign_id: string }>,
  account: string,
  campaigns: string[],
) {
  let excludedAccount = 0,
    excludedCampaign = 0;
  const selected = sales.filter((s) => {
    const ad = ads.get(s.adId);
    if (!ad || ad.account_id !== account.replace(/^act_/, "")) {
      excludedAccount++;
      return false;
    }
    if (campaigns.length && !campaigns.includes(ad.campaign_id)) {
      excludedCampaign++;
      return false;
    }
    return true;
  });
  return {
    sales: selected.length,
    revenue: selected.every((s) => s.value !== null)
      ? selected.reduce((sum, s) => sum + s.value!, 0)
      : null,
    byAd: [...new Set(selected.map((s) => s.adId))].map((id) => ({
      id,
      sales: selected.filter((s) => s.adId === id).length,
    })),
    excludedAccount,
    excludedCampaign,
  };
}
