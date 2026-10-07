import { describe, expect, it } from "vitest";
import { clientHealth, portfolioForUser, realNps } from "@/lib/client-health";
import { businessMinutesBetween } from "@/lib/clientMonitoring";
import { deduplicateMessages } from "@/lib/message-deduplication";
import { metaAdsErrorMessage } from "@/lib/meta-ads-errors";
import { observedAverage } from "@/lib/observed-score";

describe("governance v2 rules", () => {
  it("does not turn missing performance data into a neutral score or discard zero", () => {
    expect(observedAverage([null, undefined, NaN])).toBeNull();
    expect(observedAverage([null, 0, 10])).toBe(5);
    expect(observedAverage([8, null, undefined])).toBe(8);
  });
  it("counts Brasília business minutes only once, excluding weekends", () => {
    expect(businessMinutesBetween("2026-10-02T20:30:00Z", "2026-10-05T12:00:00Z")).toBe(120);
    expect(businessMinutesBetween("2026-10-03T14:00:00Z", "2026-10-04T14:00:00Z")).toBe(0);
    expect(businessMinutesBetween("2026-10-06T11:00:00Z", "2026-10-06T11:45:00Z")).toBe(45);
    expect(businessMinutesBetween("invalid", "2026-10-06T11:00:00Z")).toBe(0);
  });
  it("never assigns healthy scores to missing history", () => {
    expect(clientHealth({ total_mensagens: 0, ultimo_horario: null }).score).toBeNull();
    expect(clientHealth({ total_mensagens: 5, ultimo_horario: "invalid" }).score).toBeNull();
  });
  it("penalizes outstanding responses in business time, without pretending to be NPS", () => {
    const health = clientHealth({ total_mensagens: 3, ultimo_horario: "2026-10-06T11:00:00Z", actionable_waiting_since: "2026-10-06T11:00:00Z" }, new Date("2026-10-06T14:00:00Z"));
    expect(health.score).toBe(55);
    expect(health.nextAction).toContain("responder");
    expect(clientHealth({ total_mensagens: 1, ultimo_horario: "2026-10-02T21:30:00Z" }, new Date("2026-10-05T11:00:00Z")).score).toBe(100);
  });
  it("includes only assigned clients for non-master users", () => {
    const groups = [{ gestor_responsavel: "A" }, { gestor_responsavel: "B" }, { gestor_responsavel: null }];
    expect(portfolioForUser(groups, false, "A")).toHaveLength(1);
    expect(portfolioForUser(groups, false, null)).toEqual([]);
    expect(portfolioForUser(groups, true, null)).toHaveLength(3);
  });
  it("uses one latest valid survey per client, never group inference", () => {
    const score = realNps([
      { group_id: "a", score: 0, created_at: "2026-09-01" },
      { group_id: "a", score: 10, created_at: "2026-10-01" },
      { group_id: "b", score: 8, created_at: "2026-10-01" },
      { group_id: "c", score: 3, created_at: "2026-10-01" },
      { group_id: "d", score: 99, created_at: "2026-10-01" },
    ]);
    expect(score).toMatchObject({ total: 3, promoters: 1, passive: 1, detractors: 1, nps: 0 });
    expect(realNps([]).total).toBe(0);
  });
  it("collapses duplicate event IDs but preserves independent identical sends", () => {
    const rows = [{ id: "1", provider_id: "event-1", mensagem: "Ok" }, { id: "2", provider_id: "event-1", mensagem: "Ok" }, { id: "3", provider_id: "event-2", mensagem: "Ok" }, { id: "4", mensagem: "Ok" }];
    expect(deduplicateMessages(rows).map(r => r.id)).toEqual(["1", "3", "4"]);
    expect(deduplicateMessages([{ id: "same" }, { id: "same" }])).toHaveLength(1);
  });
  it("extracts the actual Meta failure from a non-2xx response without exposing its payload", async () => {
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: new Response(JSON.stringify({ error: "Error validating access token: The session has been invalidated", secret: "PRIVATE_TOKEN" }), { status: 400 }) });
    const message = await metaAdsErrorMessage(error);
    expect(message).toContain("A Meta recusou");
    expect(message).not.toContain("PRIVATE_TOKEN");
    expect(await metaAdsErrorMessage(new Error("META_ADS_ACCESS_TOKEN not configured"))).toContain("não está configurada");
  });
});
