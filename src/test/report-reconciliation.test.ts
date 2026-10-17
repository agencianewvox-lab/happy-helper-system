// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clinicorpStages,
  matchesLeadOrigin,
  periodHas,
  reconcileMedia,
  sameCalendarWindow,
} from "../../supabase/functions/_shared/report-reconciliation";
import { collectReport } from "../../supabase/functions/_shared/report-engine";
import {
  defaultSettings,
  reportPeriod,
  validateSettings,
} from "../../supabase/functions/_shared/report-model";
import { VoxiReader } from "../../supabase/functions/_shared/voxi-reader";
const id = (n: number) =>
  "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const account = id(1),
  connection = id(2),
  now = new Date("2026-10-17T12:00:00Z");
const settings = {
  ...defaultSettings,
  period: "custom" as const,
  customStart: "2026-10-10",
  customEnd: "2026-10-16",
  includeAds: false,
  stageMode: "auto" as const,
  metrics: [
    "leads",
    "scheduled",
    "attended",
    "cpl",
    "spend",
    "sales",
    "revenue",
  ] as any,
};
const period = reportPeriod(settings, now);
const lead = (
  n: number,
  source = "meta_ads",
  date = "2026-10-12T12:00:00Z",
) => ({
  id: id(n),
  source,
  whatsapp_instance_id: account,
  clinicorp_patient_id: n,
  ad_id: source === "meta_ads" ? "123" : null,
  lead_entered_at: date,
});
const appt = (
  n: number,
  l: number,
  status = "CHECKOUT",
  date = "2026-10-12T12:00:00Z",
) => ({
  id: id(n),
  connection_id: connection,
  lead_id: id(l),
  clinicorp_patient_id: l,
  original_created_at: date,
  scheduled_at: date,
  status_type: status,
  source: "clinicorp",
  created_at: "2026-10-17T12:00:00Z",
});
afterEach(() => vi.unstubAllGlobals());
describe("Voxi Dashboard report reconciliation", () => {
  it("separates 52 Meta leads from 14 non-Meta without treating declared origin as ad proof", () => {
    const leads = [
      ...Array.from({ length: 52 }, (_, i) => lead(10 + i)),
      ...Array.from({ length: 14 }, (_, i) => lead(100 + i, "whatsapp_cloud")),
    ];
    expect(leads.filter((l) => matchesLeadOrigin(l, "meta"))).toHaveLength(52);
    expect(leads.filter((l) => matchesLeadOrigin(l, "all"))).toHaveLength(66);
    expect(matchesLeadOrigin({ source: "manual_meta_ads" }, "meta")).toBe(true);
  });
  it("uses event dates for 16 bookings and 15 attendances including old leads", () => {
    const leads = Array.from({ length: 16 }, (_, i) =>
      lead(10 + i, "meta_ads", "2025-01-01T12:00:00Z"),
    );
    const appointments = leads.map((l, i) =>
      appt(100 + i, 10 + i, i === 15 ? "CONFIRMED" : "CHECKOUT"),
    );
    appointments.push(
      appt(500, 10),
      appt(501, 10),
      appt(502, 25, "CANCELED"),
      appt(503, 999),
    );
    const result = clinicorpStages(
      leads,
      appointments,
      [{ id: connection }],
      period,
    );
    expect(result).toMatchObject({ scheduled: 16, attended: 15 });
  });
  it("never substitutes import date for creation, guesses links or crosses connection boundaries", () => {
    const rows = [
      {
        ...appt(100, 10),
        original_created_at: null,
        scheduled_at: "2026-09-01",
      },
      { ...appt(101, 999), clinicorp_patient_id: 10 },
      { ...appt(102, 10), connection_id: id(999) },
    ];
    expect(
      clinicorpStages([lead(10)], rows, [{ id: connection }], period),
    ).toMatchObject({ scheduled: 0, attended: 0, missingBookingDates: 1 });
    expect(
      clinicorpStages(
        [lead(10)],
        [{ ...appt(103, 10), lead_id: null }],
        [{ id: connection }],
        period,
      ),
    ).toMatchObject({ scheduled: 1, attended: 1 });
  });
  it("uses clinic local timestamps and an exclusive period end", () => {
    expect(periodHas("2026-10-10T00:00:00", period)).toBe(true);
    expect(periodHas("2026-10-09T23:59:59", period)).toBe(false);
    expect(periodHas("2026-10-17T00:00:00", period)).toBe(false);
    expect(sameCalendarWindow(period, "America/Fortaleza")).toBe(true);
    expect(sameCalendarWindow(period, "America/Manaus")).toBe(false);
    expect(sameCalendarWindow(period, "bad-zone")).toBe(false);
  });
  it("explains missing October 10 media without substituting the incomplete Voxi total", () => {
    const cached = [
      {
        id: "a",
        whatsapp_instance_id: account,
        meta_ad_account_id: "777",
        date: "2026-10-11",
        ad_id: "123",
        spend: 2027.23,
        campaign_id: "11",
      },
    ];
    const result = reconcileMedia(
      [
        { date_start: "2026-10-10", spend: 285.19 },
        { date_start: "2026-10-11", spend: 2027.23 },
      ],
      [
        ...cached,
        ...cached,
        { ...cached[0], whatsapp_instance_id: id(99), spend: 5000 },
      ],
      period,
      "act_777",
      [account],
      [],
    );
    expect(result).toMatchObject({
      liveSpend: 2312.42,
      cachedSpend: 2027.23,
      difference: 285.19,
      missingDays: ["2026-10-10"],
    });
  });
  it("preserves legacy all-origin schedules but new editor drafts explicitly select Meta", () => {
    expect(defaultSettings.leadOrigin).toBe("meta");
    const old = { ...defaultSettings };
    delete old.leadOrigin;
    expect(validateSettings(old).leadOrigin).toBe("all");
    expect(() =>
      validateSettings({ ...settings, leadOrigin: "other" }),
    ).toThrow();
  });
  it("does not compare a foreign tenant cache or label missing cache as zero", () => {
    const result = reconcileMedia(
      [{ date_start: "2026-10-10", spend: 285.19 }],
      [
        {
          whatsapp_instance_id: id(999),
          meta_ad_account_id: "777",
          date: "2026-10-10",
          ad_id: "123",
          spend: 285.19,
        },
      ],
      period,
      "777",
      [account],
      [],
    );
    expect(result.cachedSpend).toBeNull();
    expect(result.difference).toBeNull();
    expect(result.liveSpend).toBe(285.19);
  });
  it("filters campaigns for event stages and keeps old ads eligible without period spend", async () => {
    const leads = [
      { ...lead(10), ad_id: "123" },
      { ...lead(11, "meta_ads", "2025-01-01T12:00:00Z"), ad_id: "456" },
      { ...lead(12), ad_id: "789" },
    ];
    const tables: Record<string, unknown[]> = {
      whatsapp_instances: [{ id: account }],
      leads,
      clinicorp_connections: [
        {
          id: connection,
          whatsapp_instance_id: account,
          enabled: true,
          last_status: "error",
        },
      ],
      clinicorp_appointments: [appt(100, 10), appt(101, 11), appt(102, 12)],
    };
    const transport = vi.fn(async (url: string) =>
      Response.json(tables[new URL(url).pathname.split("/").pop()!] || []),
    );
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/campaigns"))
        return Response.json({ data: [{ id: "11" }, { id: "22" }] });
      if (u.pathname.endsWith("/insights"))
        return Response.json({
          data: [
            {
              ad_id: "123",
              campaign_id: "11",
              ad_name: "Current ad",
              spend: 100,
              date_start: "2026-10-10",
            },
          ],
        });
      if (u.searchParams.has("ids"))
        return Response.json({
          "456": {
            id: "456",
            name: "Historical ad",
            account_id: "777",
            campaign_id: "11",
          },
          "789": {
            id: "789",
            name: "Other campaign",
            account_id: "777",
            campaign_id: "22",
          },
        });
      return Response.json({
        currency: "BRL",
        timezone_name: "America/Sao_Paulo",
      });
    });
    const result = await collectReport(
      new VoxiReader("test", transport),
      { crm_account_id: account, instance_ids: [account] },
      {
        ...settings,
        metrics: ["leads", "scheduled", "attended", "spend", "cpl"],
        campaignIds: ["11"],
      },
      "777",
      now,
      "test",
    );
    expect(result.metrics).toMatchObject({
      leads: 1,
      scheduled: 2,
      attended: 2,
      spend: 100,
      cpl: 100,
      sales: null,
    });
    expect(result.blockingReasons).toEqual([]);
    expect(
      transport.mock.calls.some((c) => c[0].includes("clinicorp_budget")),
    ).toBe(false);
  });
  it("keeps CPL available when optional ad details fail and sales sync is unavailable", async () => {
    const leads = [
      ...Array.from({ length: 52 }, (_, i) => lead(10 + i)),
      ...Array.from({ length: 14 }, (_, i) => lead(100 + i, "whatsapp_cloud")),
    ];
    const tables: any = {
      whatsapp_instances: [{ id: account }],
      leads,
      contacts: [],
      lead_identity_links: [],
      opportunities: [],
      journey_stages: [],
      stage_history: [],
      clinicorp_connections: [
        {
          id: connection,
          whatsapp_instance_id: account,
          enabled: true,
          last_status: "error",
          last_synced_at: "2026-10-13T15:00:00Z",
        },
      ],
      clinicorp_appointments: Array.from({ length: 16 }, (_, i) =>
        appt(500 + i, 10 + i, i === 15 ? "CONFIRMED" : "CHECKOUT"),
      ),
      clinicorp_budget_opportunities: [],
      acquisition_events: [],
      meta_ads_insights: [],
    };
    const transport = vi.fn(async (url: string) =>
      Response.json(tables[new URL(url).pathname.split("/").pop()!] || []),
    );
    const fetcher = vi.fn(async (url: URL | string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/insights"))
        return Response.json({
          data: [
            {
              ad_id: "123",
              campaign_id: "11",
              ad_name: "Ad",
              spend: "200",
              date_start: "2026-10-10",
              impressions: 1000,
              inline_link_clicks: 20,
            },
            {
              ad_id: "123",
              campaign_id: "11",
              ad_name: "Ad",
              spend: "112.42",
              date_start: "2026-10-11",
              impressions: 2000,
              inline_link_clicks: 30,
            },
          ],
        });
      if (u.searchParams.has("ids"))
        return Response.json({ error: { code: 100 } }, { status: 400 });
      return Response.json({
        currency: "BRL",
        timezone_name: "America/Sao_Paulo",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await collectReport(
      new VoxiReader("test-key", transport),
      { crm_account_id: account, instance_ids: [account] },
      { ...settings, includeAds: true },
      "777",
      now,
      "test-meta",
    );
    expect(result.metrics).toMatchObject({
      leads: 52,
      scheduled: 16,
      attended: 15,
      spend: 312.42,
      sales: null,
      revenue: null,
    });
    expect(result.metrics.cpl).toBeCloseTo(312.42 / 52);
    expect(result.blockingReasons.join(" ")).toMatch(/sincronização/);
    expect(result.ads[0].leads).toBe(52);
    expect(result.ads[0].spend).toBe(312.42);
    expect(
      transport.mock.calls.every(
        (c: any) => !new URL(c[0]).pathname.includes("clinicorp_sales"),
      ),
    ).toBe(true);
  });
});
