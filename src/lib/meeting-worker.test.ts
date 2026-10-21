// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { processMeetings } from "../../supabase/functions/_shared/meeting-worker";
function database({
  allowed = true,
  claim = false,
  incomplete = false,
}: { allowed?: boolean; claim?: boolean; incomplete?: boolean } = {}) {
  const updates: { table: string; data: Record<string, unknown> }[] = [];
  const meeting = {
    id: "m1",
    owner_id: "u1",
    client_id: "c1",
    device_id: "d1",
    status: "finalizing",
    expected_chunks: incomplete ? 2 : 1,
    summary_attempts: 0,
  };
  const chunk = {
    meeting_id: "m1",
    seq: 0,
    storage_path: "m1/0.webm",
    lease_id: "lease1",
    attempts: 1,
  };
  const db = {
    rpc: vi.fn(async (name: string) => ({
      data: name === "claim_meeting_chunks" ? (claim ? [chunk] : []) : allowed,
      error: null,
    })),
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob(["mock audio"]), error: null }),
        remove: async () => ({ error: null }),
      }),
    },
    from(table: string) {
      let operation = "select",
        columns = "",
        update: Record<string, unknown> = {},
        clean = false,
        single = false;
      const query = {
        select(value: string) {
          columns = value;
          return query;
        },
        update(value: Record<string, unknown>) {
          operation = "update";
          update = value;
          return query;
        },
        insert(value: Record<string, unknown>) {
          operation = "insert";
          update = value;
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        is() {
          return query;
        },
        or() {
          clean = true;
          return query;
        },
        single() {
          single = true;
          return query;
        },
        then(resolve: (v: unknown) => unknown) {
          if (operation !== "select") {
            updates.push({ table, data: update });
            return Promise.resolve(
              resolve({
                data: columns === "id" ? [{ id: "m1" }] : null,
                error: null,
              }),
            );
          }
          return Promise.resolve(
            resolve({
              data: single
                ? meeting
                : clean
                  ? []
                  : table === "client_meetings"
                    ? [meeting]
                    : [
                        {
                          seq: 0,
                          status: "done",
                          offset_ms: 0,
                          transcript: "Aprovar a proposta na sexta.",
                        },
                      ],
              error: null,
            }),
          );
        },
      };
      return query;
    },
  };
  return { db, updates };
}
afterEach(() => vi.unstubAllGlobals());
describe("meeting worker (mock provider, no real audio or costs)", () => {
  it("turns complete chunks into a draft, not an automatic task", async () => {
    const { db, updates } = database();
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Rascunho",
                    decisions: [],
                    goals: [],
                    actions: ["Confirmar proposta"],
                    openQuestions: [],
                  }),
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    await processMeetings(db, "test-key");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(updates.some((u) => u.data.status === "ready")).toBe(true);
    expect(updates.some((u) => u.table === "tasks")).toBe(false);
  });
  it("does not summarize if any expected chunk is missing", async () => {
    const { db, updates } = database({ incomplete: true });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await processMeetings(db, "test-key");
    expect(fetcher).not.toHaveBeenCalled();
    expect(updates.some((u) => u.data.status === "ready")).toBe(false);
  });
  it("checks portfolio again before provider requests", async () => {
    const { db, updates } = database({ allowed: false, claim: true });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await processMeetings(db, "test-key");
    expect(fetcher).not.toHaveBeenCalled();
    expect(updates.some((u) => u.data.error === "authorization_revoked")).toBe(
      true,
    );
  });
  it("does not persist provider error bodies or secrets", async () => {
    const { db, updates } = database({ claim: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("sensitive provider payload", { status: 429 }),
      ),
    );
    await processMeetings(db, "test-key");
    expect(JSON.stringify(updates)).not.toContain("sensitive provider payload");
    expect(JSON.stringify(updates)).not.toContain("test-key");
    expect(updates.some((u) => u.data.status === "ready")).toBe(false);
  });
});
