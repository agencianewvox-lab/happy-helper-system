import { ReportSettings, zonedMidnight } from "./report-model.ts";
type Row = Record<string, any>;
type Period = {
  start: string;
  end: string;
  startDate: string;
  endDate: string;
};

export function periodHas(
  date: unknown,
  period: Pick<Period, "start" | "end">,
) {
  if (typeof date !== "string" || !date) return false;
  // Clinicorp timestamps without offset are clinic-local, never server-local UTC.
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date + "T00:00:00-03:00"
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(date)
      ? date + "-03:00"
      : date;
  const t = Date.parse(value);
  return (
    Number.isFinite(t) &&
    t >= Date.parse(period.start) &&
    t < Date.parse(period.end)
  );
}

export function matchesLeadOrigin(
  lead: Row,
  origin: ReportSettings["leadOrigin"],
) {
  // Matches the Voxi Dashboard origin selector. Manual declarations may appear
  // here, but still never prove ad attribution for CPL, ranking or closed sales.
  return (
    origin !== "meta" ||
    ["meta_ads", "manual_meta_ads"].includes(
      String(lead.source || "")
        .trim()
        .toLowerCase(),
    )
  );
}

export function clinicorpStages(
  leads: Row[],
  appointments: Row[],
  connections: Row[],
  period: Period,
) {
  const connectionIds = new Set(connections.map((c) => c.id));
  const allIds = new Set(leads.map((l) => l.id));
  const byPatient = new Map<string, string[]>();
  for (const l of leads)
    if (l.clinicorp_patient_id != null) {
      const key = String(l.clinicorp_patient_id);
      byPatient.set(key, [...(byPatient.get(key) || []), l.id]);
    }
  const scheduled = new Set<string>(),
    attended = new Set<string>();
  const canceled = new Set(["CANCELLED", "CANCELED", "DELETED", "EXCLUDED"]);
  const present = new Set([
    "ARRIVED",
    "CHECKOUT",
    "IN_SESSION",
    "COMPLETED",
    "ATTENDED",
    "CHECKED_IN",
    "PRESENT",
    "DONE",
    "FINISHED",
  ]);
  let missingBookingDates = 0;
  for (const a of appointments) {
    if (!connectionIds.has(a.connection_id)) continue;
    // An explicit foreign lead wins over a patient fallback: never leak another client.
    const ids = a.lead_id
      ? allIds.has(a.lead_id)
        ? [a.lead_id]
        : []
      : byPatient.get(String(a.clinicorp_patient_id)) || [];
    if (!ids.length) continue;
    const created =
      a.original_created_at ||
      (["voxi", "manual"].includes(a.source) ? a.created_at : null);
    const status = String(a.status_type || "")
      .trim()
      .toUpperCase();
    if (!created && !canceled.has(status)) missingBookingDates++;
    if (!canceled.has(status) && periodHas(created, period))
      ids.forEach((id) => scheduled.add(id));
    if (present.has(status) && periodHas(a.scheduled_at, period))
      ids.forEach((id) => attended.add(id));
  }
  return {
    scheduled: scheduled.size,
    attended: attended.size,
    missingBookingDates,
  };
}

export function sameCalendarWindow(period: Period, timezone: string) {
  try {
    const next = new Date(period.endDate + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    return (
      zonedMidnight(period.startDate, timezone) === period.start &&
      zonedMidnight(next.toISOString().slice(0, 10), timezone) === period.end
    );
  } catch {
    return false;
  }
}

export function reconcileMedia(
  live: Row[],
  cached: Row[],
  period: Period,
  account: string,
  instanceIds: string[],
  campaigns: string[],
) {
  const liveDays = new Map<string, number>(),
    cachedDays = new Map<string, number>();
  for (const row of live)
    if (row.date_start)
      liveDays.set(
        row.date_start,
        (liveDays.get(row.date_start) || 0) + Number(row.spend || 0),
      );
  const seen = new Set<string>();
  const valid = cached.filter(
    (row) =>
      instanceIds.includes(row.whatsapp_instance_id) &&
      String(row.meta_ad_account_id).replace(/^act_/, "") ===
        account.replace(/^act_/, "") &&
      row.date >= period.startDate &&
      row.date <= period.endDate &&
      (!campaigns.length || campaigns.includes(row.campaign_id)),
  );
  for (const row of valid) {
    const key = row.date + ":" + row.ad_id;
    if (seen.has(key)) continue;
    seen.add(key);
    cachedDays.set(
      row.date,
      (cachedDays.get(row.date) || 0) + Number(row.spend || 0),
    );
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const liveSpend = round(
    live.reduce((n, row) => n + Number(row.spend || 0), 0),
  );
  // Empty history in this authorized tenant is unknown, never a zero investment.
  const cachedSpend = valid.length
    ? round([...cachedDays.values()].reduce((a, b) => a + b, 0))
    : null;
  const missingDays = [...liveDays]
    .filter(([day, spend]) => spend > 0 && !cachedDays.has(day))
    .map(([day]) => day)
    .sort();
  return {
    liveSpend,
    cachedSpend,
    difference: cachedSpend === null ? null : round(liveSpend - cachedSpend),
    missingDays,
    lastCachedAt:
      valid
        .map((r) => r.updated_at)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
  };
}
