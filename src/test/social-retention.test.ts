// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  cleanPublishedVideos,
  remotePublication,
} from "../../supabase/functions/_shared/social-retention";
const job = {
  id: "job",
  client_id: "client",
  instagram_id: "123",
  status: "published",
  media_id: "456",
  snapshot: { assets: [{ path: "client/video.mp4", type: "video/mp4" }] },
};
function harness(paths = ["client/video.mp4"]) {
  const remove = vi.fn(async () => ({ data: [] })),
    updates: unknown[] = [];
  const db = {
    rpc: vi.fn(async (n: string) => ({
      data:
        n === "social_credential"
          ? { token: "secret", instagram_id: "123", expires_at: "2099-01-01" }
          : n === "social_reserve_cleanup"
            ? paths
            : true,
    })),
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        is: () => q,
        lt: () => q,
        or: () => q,
        limit: async () => ({ data: [job] }),
        update: (v: unknown) => {
          updates.push(v);
          return q;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [] }).then(resolve),
      };
      return q;
    },
    storage: { from: () => ({ remove }) },
  };
  return { db, remove, updates };
}
describe("Published-video retention", () => {
  it("removes only exact reserved paths after remote video confirmation", async () => {
    const { db, remove } = harness();
    const provider = vi.fn(async () => ({
      media_type: "VIDEO",
      media_url: "https://cdninstagram.com/video",
    }));
    expect(await cleanPublishedVideos(db, provider)).toBe(1);
    expect(remove).toHaveBeenCalledWith(["client/video.mp4"]);
    expect(db.rpc).toHaveBeenCalledWith("social_complete_cleanup", {
      j: "job",
    });
  });
  it("preserves media referenced by another content", async () => {
    const { db, remove } = harness([]);
    await cleanPublishedVideos(
      db,
      vi.fn(async () => ({
        media_type: "VIDEO",
        media_url: "https://cdninstagram.com/video",
      })),
    );
    expect(remove).not.toHaveBeenCalled();
  });
  it("never removes files when the published video cannot be read", async () => {
    const { db, remove } = harness();
    await cleanPublishedVideos(
      db,
      vi.fn(async () => {
        throw new Error("Unavailable");
      }),
    );
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects a path outside the client even if a bad database response returns it", async () => {
    const { db, remove } = harness(["other/video.mp4"]);
    await cleanPublishedVideos(
      db,
      vi.fn(async () => ({
        media_type: "VIDEO",
        media_url: "https://cdninstagram.com/video",
      })),
    );
    expect(remove).not.toHaveBeenCalled();
  });
  it("does not record cleanup success when storage deletion fails", async () => {
    const { db, remove } = harness();
    remove.mockResolvedValue({ error: new Error("failed") } as never);
    await cleanPublishedVideos(
      db,
      vi.fn(async () => ({
        media_type: "VIDEO",
        media_url: "https://cdninstagram.com/video",
      })),
    );
    expect(
      db.rpc.mock.calls.some((x) => x[0] === "social_complete_cleanup"),
    ).toBe(false);
  });
  it("does not fetch media belonging to another connected profile", async () => {
    const { db } = harness();
    const provider = vi.fn();
    await expect(
      remotePublication(db, { ...job, instagram_id: "999" }, provider),
    ).rejects.toThrow("original");
    expect(provider).not.toHaveBeenCalled();
  });
});
