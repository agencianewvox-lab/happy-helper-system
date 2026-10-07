import { describe, expect, it, vi } from "vitest";
import { createMeetingPlanStore, type MeetingPlanTransport } from "@/lib/onboarding-plan-store";
import { emptyMeetingPlan } from "@/lib/onboarding-plan";

const responseId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const groupId = "fixture@g.us";
const row = { response_id: responseId, group_id: groupId, plan: { ...emptyMeetingPlan(), focus: "Plano revisado" }, version: 1, updated_at: "2026-10-06T12:00:00Z", updated_by: userId };
function setup() {
  const transport: MeetingPlanTransport = { read: vi.fn().mockResolvedValue({ data: row, error: null }), insert: vi.fn().mockResolvedValue({ data: [row], error: null }), update: vi.fn().mockResolvedValue({ data: [{ ...row, version: 2 }], error: null }) };
  return { transport, store: createMeetingPlanStore(transport) };
}
describe("shared onboarding plan persistence", () => {
  it("loads the shared record, not a browser-specific copy", async () => {
    const { store, transport } = setup();
    expect(await store.load(responseId, groupId)).toEqual(row);
    expect(transport.read).toHaveBeenCalledWith(responseId);
  });
  it("creates a plan without accepting an operator or audit fields from the browser", async () => {
    const { store, transport } = setup();
    expect(await store.save(responseId, groupId, row.plan, 0)).toEqual(row);
    expect(transport.insert).toHaveBeenCalledWith({ response_id: responseId, group_id: groupId, plan: row.plan });
    expect(transport.update).not.toHaveBeenCalled();
  });
  it("uses an optimistic version predicate for edits", async () => {
    const { store, transport } = setup();
    expect((await store.save(responseId, groupId, row.plan, 1)).version).toBe(2);
    expect(transport.update).toHaveBeenCalledWith(responseId, 1, row.plan);
  });
  it("does not overwrite on a concurrent insert or a zero-row update", async () => {
    const { store, transport } = setup();
    vi.mocked(transport.insert).mockResolvedValue({ data: null, error: { code: "23505" } });
    await expect(store.save(responseId, groupId, row.plan, 0)).rejects.toMatchObject({ kind: "conflict" });
    vi.mocked(transport.update).mockResolvedValue({ data: [], error: null });
    await expect(store.save(responseId, groupId, row.plan, 1)).rejects.toMatchObject({ kind: "conflict" });
    expect(transport.insert).toHaveBeenCalledTimes(1);
    expect(transport.update).toHaveBeenCalledTimes(1);
  });
  it.each([["42P01", "unavailable"], ["PGRST205", "unavailable"], ["42501", "denied"]])("handles %s without claiming success", async (code, kind) => {
    const { store, transport } = setup();
    vi.mocked(transport.read).mockResolvedValue({ data: null, error: { code } });
    await expect(store.load(responseId, groupId)).rejects.toMatchObject({ kind });
  });
  it("rejects a different client or response returned by a malformed backend", async () => {
    const { store, transport } = setup();
    vi.mocked(transport.read).mockResolvedValue({ data: { ...row, group_id: "another@g.us" }, error: null });
    await expect(store.load(responseId, groupId)).rejects.toMatchObject({ kind: "invalid" });
  });
  it("validates input before making any request", async () => {
    const { store, transport } = setup();
    await expect(store.save(responseId, groupId, { ...row.plan, focus: "x".repeat(1501) }, 0)).rejects.toMatchObject({ kind: "invalid" });
    await expect(store.load("not-a-uuid", groupId)).rejects.toMatchObject({ kind: "invalid" });
    expect(transport.insert).not.toHaveBeenCalled(); expect(transport.read).not.toHaveBeenCalled();
  });
  it("does not turn a network failure into an empty or saved plan", async () => {
    const { store, transport } = setup();
    vi.mocked(transport.read).mockRejectedValue(new Error("network"));
    await expect(store.load(responseId, groupId)).rejects.toMatchObject({ kind: "network" });
  });
});
