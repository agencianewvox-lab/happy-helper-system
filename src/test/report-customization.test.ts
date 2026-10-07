// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  defaultSettings,
  validateSettings,
  reportPeriod,
  scheduleSlot,
  renderReport,
  unknownTokens,
} from "../../supabase/functions/_shared/report-model";
import { collectReport } from "../../supabase/functions/_shared/report-engine";
import { VoxiReader } from "../../supabase/functions/_shared/voxi-reader";
const meta = {
  ...defaultSettings,
  dataMode: "meta" as const,
  metrics: ["spend", "clicks", "cpc", "cpm", "ctr"] as const,
  ranking: "clicks" as const,
};
const settings = () => ({ ...meta, metrics: [...meta.metrics] });
afterEach(() => vi.unstubAllGlobals());
describe("custom report content and period", () => {
  it("preserves old configurations without optional fields", () =>
    expect(validateSettings(defaultSettings).dataMode).toBe("crm_meta"));
  it("supports aliases and exact custom message order", () => {
    const s = {
      ...defaultSettings,
      template:
        "Leads: {{Leads reais voxi}}\nValor investido: {{meta ads}}\nVendas: {{vendas}}",
    };
    const text = renderReport("Client", s, {
      period: { startDate: "2026-10-01", endDate: "2026-10-07" },
      metrics: { leads: 12, spend: 100, sales: null },
      warnings: [],
    });
    expect(text).toMatch(/^Leads: 12\nValor investido: R\$/);
    expect(text).toContain("Vendas: N/D");
    expect(text).not.toContain("{{");
  });
  it("rejects unknown or malformed placeholders", () => {
    expect(unknownTokens("{{other_account}}")).toEqual(["other_account"]);
    expect(() =>
      validateSettings({ ...defaultSettings, template: "{{other_account}}" }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...defaultSettings, template: "{{investimento}" }),
    ).toThrow();
  });
  it("does not invent CRM numbers when only Meta is configured", () => {
    expect(() =>
      validateSettings({ ...settings(), template: "Vendas: {{vendas}}" }),
    ).toThrow(/só Meta/);
    expect(() =>
      validateSettings({ ...settings(), metrics: ["leads"] }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...settings(), campaignIds: ["other/account"] }),
    ).toThrow();
  });
  it("includes the full last custom day in Sao Paulo and rejects invalid dates", () => {
    const s = {
      ...defaultSettings,
      period: "custom" as const,
      customStart: "2026-10-01",
      customEnd: "2026-10-07",
    };
    const p = reportPeriod(s, new Date("2026-10-07T20:00:00Z"));
    expect(p.start).toBe("2026-10-01T03:00:00.000Z");
    expect(p.end).toBe("2026-10-08T03:00:00.000Z");
    expect(() =>
      validateSettings({ ...s, customStart: "2026-02-31" }),
    ).toThrow();
    expect(() =>
      reportPeriod(
        { ...s, customEnd: "2026-10-08" },
        new Date("2026-10-07T20:00:00Z"),
      ),
    ).toThrow(/futuras/);
  });
  it("makes inclusion of today explicit without changing legacy periods", () => {
    const now = new Date("2026-10-07T20:00:00Z");
    expect(reportPeriod(defaultSettings, now).startDate).toBe("2026-09-30");
    expect(
      reportPeriod({ ...defaultSettings, includeToday: true }, now).startDate,
    ).toBe("2026-10-01");
  });
  it("bounds agendas and prevents repeatedly resending a fixed historical period", () => {
    const s = {
      ...defaultSettings,
      frequency: "daily" as const,
      skipWeekends: true,
      scheduleStart: "2026-10-01",
      scheduleEnd: "2026-10-09",
    };
    expect(scheduleSlot(s, new Date("2026-10-09T12:00:00Z"))).toBe(
      "2026-10-09",
    );
    expect(scheduleSlot(s, new Date("2026-10-10T12:00:00Z"))).toBeNull();
    expect(
      scheduleSlot(
        {
          ...s,
          period: "custom",
          customStart: "2026-10-01",
          customEnd: "2026-10-07",
        },
        new Date("2026-10-09T12:00:00Z"),
      ),
    ).toBeNull();
    expect(
      scheduleSlot(
        { ...s, frequency: "once", onceDate: "2026-10-09" },
        new Date("2026-10-09T12:00:00Z"),
      ),
    ).toBe("2026-10-09");
  });
});
describe("Meta only dataflow", () => {
  it("never queries Voxi, applies campaign filtering and aggregates weighted rates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "100", name: "Campaign A" }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ currency: "BRL", timezone_name: "America/Sao_Paulo" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              ad_id: "1",
              ad_name: "Ad A",
              campaign_id: "100",
              campaign_name: "Campaign A",
              spend: "200",
              impressions: "1000",
              inline_link_clicks: "20",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const transport = vi.fn();
    const result = await collectReport(
      new VoxiReader("", transport),
      null,
      { ...settings(), campaignIds: ["100"] },
      "123",
      new Date("2026-10-07T20:00:00Z"),
      "server-only",
    );
    expect(transport).not.toHaveBeenCalled();
    expect(result.metrics).toMatchObject({
      leads: null,
      sales: null,
      spend: 200,
      cpc: 10,
      cpm: 200,
      ctr: 2,
    });
    expect(result.campaigns[0].name).toBe("Campaign A");
    expect(result.ads[0].clicks).toBe(20);
    const url = new URL(fetcher.mock.calls[2][0]);
    expect(JSON.parse(url.searchParams.get("filtering")!)[0].value).toEqual([
      "100",
    ]);
    expect(url.toString()).not.toContain("server-only");
    const message = renderReport("Client", settings(), result);
    expect(message).toContain("Sem dados de CRM");
    expect(message).not.toContain("0 vendas");
  });
  it("blocks a campaign outside the bound ad account", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ data: [{ id: "200", name: "Other" }] }),
        ),
    );
    await expect(
      collectReport(
        new VoxiReader(""),
        null,
        { ...settings(), campaignIds: ["100"] },
        "123",
        new Date(),
        "key",
      ),
    ).rejects.toThrow(/não pertence/);
  });
  it("fails instead of sending a misleading zero report if Meta is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ error: {} }, { status: 401 })),
    );
    await expect(
      collectReport(
        new VoxiReader(""),
        null,
        settings(),
        "123",
        new Date(),
        "key",
      ),
    ).rejects.toThrow(/indisponível/);
  });
});
