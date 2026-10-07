// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  defaultSettings,
  reportPeriod,
  scheduleSlot,
  validateSettings,
  renderReport,
} from "../../supabase/functions/_shared/report-model";
import {
  VoxiReader,
  deriveScope,
} from "../../supabase/functions/_shared/voxi-reader";
import { aggregateCommercial } from "../../supabase/functions/_shared/report-engine";
const id = (n: number) =>
  "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
describe("CRM read-only transport", () => {
  it("continues after a smaller server page instead of silently truncating", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([{ id: id(1) }, { id: id(2) }], {
          headers: { "Content-Range": "0-1/3" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json([{ id: id(3) }], {
          headers: { "Content-Range": "2-2/3" },
        }),
      );
    const data = await new VoxiReader("key", transport).read("leads", {
      whatsapp_instance_id: "eq." + id(10),
    });
    expect(data).toHaveLength(3);
    expect(transport.mock.calls[1][1].headers.Range).toBe("2-1001");
  });
  it("paginates with GET and never exposes credentials in URL or private projections", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(Array.from({ length: 1000 }, (_, i) => ({ id: i }))),
      )
      .mockResolvedValueOnce(Response.json([{ id: 1000 }]));
    const data = await new VoxiReader("server-only", transport).read("leads", {
      whatsapp_instance_id: "eq." + id(1),
    });
    expect(data).toHaveLength(1001);
    expect(transport.mock.calls[0][1].method).toBe("GET");
    expect(transport.mock.calls[1][1].headers.Range).toBe("1000-1999");
    expect(transport.mock.calls[0][0]).not.toContain("server-only");
    expect(transport.mock.calls[0][0]).not.toContain("phone");
  });
  it("rejects arbitrary resources and filters without fetching", async () => {
    const transport = vi.fn(),
      reader = new VoxiReader("key", transport);
    await expect(reader.read("auth/users" as never)).rejects.toThrow();
    await expect(reader.read("leads", { phone: "eq.123" })).rejects.toThrow();
    await expect(reader.read("leads", { id: "or.(true)" })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("separates canonical accounts and excludes mass-dispatch connections", () => {
    const rows = [
      { id: id(1) },
      { id: id(2), parent_instance_id: id(1) },
      { id: id(3) },
      {
        id: id(4),
        parent_instance_id: id(1),
        connection_purpose: "mass_dispatch",
      },
    ];
    expect(deriveScope(id(1), rows).ids).toEqual([id(1), id(2)]);
    expect(() => deriveScope(id(2), rows)).toThrow();
  });
});
describe("commercial semantics", () => {
  const period = {
    start: "2026-10-01T03:00:00.000Z",
    end: "2026-10-08T03:00:00.000Z",
  };
  const leads = [
    {
      id: id(1),
      pipeline_id: id(20),
      lead_entered_at: "2026-10-01T03:00:00+00:00",
      ad_id: "ad1",
    },
    {
      id: id(2),
      pipeline_id: id(20),
      lead_entered_at: "2026-10-07T12:00:00Z",
      ad_id: "ad1",
    },
    { id: id(3), lead_entered_at: "2026-10-08T03:00:00Z" },
    { id: id(4), pipeline_id: null, lead_entered_at: "2026-10-05T12:00:00Z" },
  ];
  const links = [
      { lead_id: id(1), contact_id: id(10) },
      { lead_id: id(2), contact_id: id(11) },
    ],
    contacts = [{ id: id(10), merged_into_id: id(11) }, { id: id(11) }];
  it("deduplicates merged contacts, includes exact start, excludes exact end", () => {
    const r = aggregateCommercial(
      leads,
      links,
      contacts,
      [],
      [],
      [],
      defaultSettings,
      period,
    );
    expect(r.metrics.leads).toBe(2);
    expect(r.metaLeadCount).toBe(1);
  });
  it("excludes unidentified legacy funnels when selecting one funnel", () => {
    const r = aggregateCommercial(
      leads,
      links,
      contacts,
      [],
      [],
      [],
      { ...defaultSettings, pipelines: [id(20)] },
      period,
    );
    expect(r.metrics.leads).toBe(1);
    expect(r.warnings.join(" ")).toContain("sem funil");
  });
  it("counts sales by actual won_at, not current position; no mapping stays N/D", () => {
    const opps = [
      {
        id: id(40),
        lead_id: id(1),
        won_at: "2026-10-05T12:00:00Z",
        value: 500,
      },
      {
        id: id(41),
        lead_id: id(2),
        won_at: "2026-09-01T00:00:00Z",
        value: 100,
      },
    ];
    const r = aggregateCommercial(
      leads,
      links,
      contacts,
      opps,
      [],
      [],
      defaultSettings,
      period,
    );
    expect(r.metrics.sales).toBe(1);
    expect(r.metrics.revenue).toBe(500);
    expect(r.metrics.scheduled).toBeNull();
  });
  it("never guesses duplicate historical stage names", () => {
    const stages = [
      { id: id(30), name: "Agendado", pipeline_id: id(20) },
      { id: id(31), name: "Agendado", pipeline_id: id(21) },
    ];
    const r = aggregateCommercial(
      leads,
      links,
      contacts,
      [],
      [
        {
          lead_id: id(1),
          to_stage: "Agendado",
          changed_at: "2026-10-05T12:00:00Z",
        },
      ],
      stages,
      { ...defaultSettings, stages: { scheduled: [id(30)], attended: [] } },
      period,
    );
    expect(r.metrics.scheduled).toBeNull();
  });
});
describe("closed periods and safe schedules", () => {
  it("handles previous month across a year boundary in the selected timezone", () => {
    const r = reportPeriod(
      { ...defaultSettings, period: "previousMonth" },
      new Date("2026-01-01T14:00:00Z"),
    );
    expect(r.startDate).toBe("2025-12-01");
    expect(r.endDate).toBe("2025-12-31");
    expect(r.start).toBe("2025-12-01T03:00:00.000Z");
  });
  it("clamps monthly day and keeps idempotency slot on edits", () => {
    const s = {
      ...defaultSettings,
      frequency: "monthly" as const,
      monthDay: 31,
    };
    expect(scheduleSlot(s, new Date("2026-02-28T11:59:00Z"))).toBeNull();
    expect(scheduleSlot(s, new Date("2026-02-28T12:00:00Z"))).toBe(
      "2026-02-28",
    );
    expect(
      scheduleSlot({ ...s, time: "08:30" }, new Date("2026-02-28T12:00:00Z")),
    ).toBe("2026-02-28");
    expect(scheduleSlot(s, new Date("2026-02-28T16:00:00Z"))).toBeNull();
  });
  it("rejects unapproved metrics, malformed UUIDs and impossible schedules", () => {
    expect(() =>
      validateSettings({ ...defaultSettings, metrics: ["meta_leads"] }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...defaultSettings, time: "25:00" }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...defaultSettings, pipelines: ["other-client"] }),
    ).toThrow();
  });
  it("shows missing data as N/D, not zero", () => {
    const text = renderReport("Client", defaultSettings, {
      period: { startDate: "2026-10-01", endDate: "2026-10-07" },
      metrics: { leads: 10, scheduled: null },
      warnings: [],
    });
    expect(text).toContain("agendamento: N/D");
    expect(text).toContain("Leads reais · CRM: 10");
  });
});
