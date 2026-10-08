// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  publishIssues,
  containerBody,
  reportRange,
  graph,
  InstagramError,
} from "../../supabase/functions/_shared/social-publishing";
import { processPublication } from "../../supabase/functions/_shared/social-worker";
const account = {
  account_type: "BUSINESS",
  can_publish: true,
  expires_at: "2099-01-01",
  instagram_id: "123",
  connected_at: "2026-10-08",
  token: "test-token",
};
const asset = {
  path: "client/image.jpg",
  name: "image",
  type: "image/jpeg",
  size: 1024,
};
const content = { format: "image" as const, assets: [asset], caption: "Texto" };
describe("Instagram publishing validation", () => {
  it("allows JPEG feed and business Stories", () => {
    expect(publishIssues(content, account)).toEqual([]);
    expect(publishIssues({ ...content, format: "story" }, account)).toEqual([]);
  });
  it("rejects creator Stories", () =>
    expect(
      publishIssues(
        { ...content, format: "story" },
        { ...account, account_type: "MEDIA_CREATOR" },
      ).join(),
    ).toContain("Empresa"));
  it("requires permission and valid token", () =>
    expect(
      publishIssues(content, {
        ...account,
        can_publish: false,
        expires_at: "2000-01-01",
      }),
    ).toHaveLength(2));
  it("enforces carousel API limit", () => {
    expect(
      publishIssues({ ...content, format: "carousel" }, account).join(),
    ).toContain("2 a 10");
    expect(
      publishIssues(
        { ...content, format: "carousel", assets: Array(11).fill(asset) },
        account,
      ).length,
    ).toBeGreaterThan(0);
  });
  it("rejects unsupported image and oversize video", () => {
    expect(
      publishIssues(
        { ...content, assets: [{ ...asset, type: "image/png" }] },
        account,
      ).join(),
    ).toContain("JPG");
    expect(
      publishIssues(
        {
          ...content,
          format: "reel",
          assets: [{ ...asset, type: "video/mp4", size: 2 * 1024 ** 3 }],
        },
        account,
      ).join(),
    ).toContain("limite");
  });
  it("does not send captions as story overlays", () =>
    expect(
      containerBody(
        { ...content, format: "story" } as never,
        asset,
        "https://signed",
      ),
    ).toEqual({ image_url: "https://signed", media_type: "STORIES" }));
  it("uses carousel video container, not a standalone reel", () =>
    expect(
      containerBody(
        { ...content, format: "carousel" } as never,
        { type: "video/mp4" },
        "https://signed",
        true,
      ),
    ).toEqual({
      video_url: "https://signed",
      media_type: "VIDEO",
      is_carousel_item: true,
    }));
  it("builds Brasília-inclusive date ranges", () => {
    const r = reportRange("2026-10-01", "2026-10-07");
    expect(new Date(r.start * 1000).toISOString()).toBe(
      "2026-10-01T03:00:00.000Z",
    );
    expect(r.end - r.start).toBe(7 * 86400 - 1);
  });
  it("rejects reversed or oversized report ranges", () => {
    expect(() => reportRange("2026-10-08", "2026-10-01")).toThrow();
    expect(() => reportRange("2026-01-01", "2026-10-01")).toThrow();
  });
  it("does not leak provider response or token in errors", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 190, message: "secret-token" } },
          { status: 400 },
        ),
      );
    await expect(
      graph("secret-token", "/me", undefined, request),
    ).rejects.toThrow("Reconecte");
  });
});
function harness(
  options: {
    actor?: boolean;
    begin?: boolean;
    version?: number;
    identity?: string;
  } = {},
) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    rpc: vi.fn(async (name: string) => {
      if (name === "social_credential")
        return {
          data: { ...account, instagram_id: options.identity || "123" },
        };
      if (name === "social_actor_allowed")
        return { data: options.actor !== false };
      if (name === "social_begin_publish")
        return { data: options.begin !== false };
      return { data: true };
    }),
    from: vi.fn(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: (v: Record<string, unknown>) => {
          updates.push(v);
          return chain;
        },
        single: async () => ({
          data: { version: options.version || 1, status: "approved" },
        }),
        maybeSingle: async () => ({ data: { id: "job" } }),
      };
      return chain;
    }),
  };
  const job = {
    id: "job",
    post_id: "post",
    client_id: "client",
    actor_id: "staff",
    instagram_id: "123",
    connected_at: account.connected_at,
    post_version: 1,
    root_container: "456",
    containers: ["456"],
    lock_token: "lease",
    status: "processing",
    due_at: new Date().toISOString(),
    snapshot: content,
  };
  return { db, job, updates };
}
describe("Durable Instagram worker", () => {
  it("publishes once after a successful final fence and commits atomically", async () => {
    const { db, job } = harness();
    const provider = vi.fn(async (_t: string, p: string) =>
      p.endsWith("media_publish")
        ? { id: "789" }
        : p.includes("permalink")
          ? { permalink: "https://www.instagram.com/p/x/" }
          : { status_code: "FINISHED" },
    );
    await processPublication(db, job, provider);
    expect(
      provider.mock.calls.filter((x) => x[1].endsWith("media_publish")),
    ).toHaveLength(1);
    expect(db.rpc).toHaveBeenCalledWith("social_finish_publication", {
      j: "job",
      l: "lease",
      m: "789",
      p: null,
    });
  });
  it.each([
    { actor: false },
    { begin: false },
    { version: 2 },
    { identity: "999" },
  ])(
    "never publishes after authorization/version/binding failure %j",
    async (options) => {
      const { db, job, updates } = harness(options);
      const provider = vi.fn(async (_token: string, _path: string) => ({
        status_code: "FINISHED",
      }));
      await processPublication(db, job, provider);
      expect(
        provider.mock.calls.some((x) => String(x[1]).endsWith("media_publish")),
      ).toBe(false);
      expect(updates.at(-1)?.status).toBe("failed");
    },
  );
  it("does not retry an ambiguous external publish", async () => {
    const { db, job, updates } = harness();
    const provider = vi.fn(async (_t: string, p: string) => {
      if (p.endsWith("media_publish")) throw new InstagramError(0, true);
      return { status_code: "FINISHED" };
    });
    await processPublication(db, job, provider);
    expect(updates.at(-1)?.status).toBe("uncertain");
    provider.mockClear();
    await processPublication(db, { ...job, status: "uncertain" }, provider);
    expect(
      provider.mock.calls.some((x) => x[1].endsWith("media_publish")),
    ).toBe(false);
  });
  it("reconciles PUBLISHED without another external POST", async () => {
    const { db, job } = harness();
    const provider = vi.fn(async () => ({ status_code: "PUBLISHED" }));
    await processPublication(db, { ...job, status: "uncertain" }, provider);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith(
      "social_finish_publication",
      expect.objectContaining({ j: "job" }),
    );
  });
  it("waits for processing instead of claiming publication", async () => {
    const { db, job, updates } = harness();
    await processPublication(
      db,
      job,
      vi.fn(async () => ({ status_code: "IN_PROGRESS" })),
    );
    expect(updates.at(-1)?.status).toBe("processing");
    expect(
      db.rpc.mock.calls.some((x) => x[0] === "social_finish_publication"),
    ).toBe(false);
  });
});
