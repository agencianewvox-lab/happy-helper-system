import { describe, expect, it } from "vitest";
import {
  contentInput,
  transition,
} from "../../supabase/functions/_shared/social-model";
import { editorialDate, localInput, utcInput } from "@/lib/social";
const asset = {
  path: "client-a/asset.png",
  name: "Arte",
  type: "image/png",
  size: 100,
};
describe("Social editorial validation", () => {
  it("accepts own immutable asset paths and strips signed URLs", () => {
    const value = contentInput(
      {
        title: " Post ",
        assets: [{ ...asset, url: "https://temporary.invalid" }],
      },
      "client-a",
    );
    expect(value.title).toBe("Post");
    expect(value.assets[0]).not.toHaveProperty("url");
  });
  it("rejects assets from another client", () =>
    expect(() =>
      contentInput({ title: "Post", assets: [asset] }, "client-b"),
    ).toThrow("biblioteca"));
  it.each(["toString", "__proto__", "unknown"])(
    "rejects invalid format %s",
    (format) =>
      expect(() => contentInput({ title: "Post", format }, "client-a")).toThrow(
        "Formato",
      ),
  );
  it("rejects directory traversal", () =>
    expect(() =>
      contentInput(
        {
          title: "Post",
          assets: [{ ...asset, path: "client-a/../secret.png" }],
        },
        "client-a",
      ),
    ).toThrow("biblioteca"));
  it("rejects long captions and unsupported files", () => {
    expect(() =>
      contentInput({ title: "Post", caption: "x".repeat(2201) }, "client-a"),
    ).toThrow();
    expect(() =>
      contentInput(
        { title: "Post", assets: [{ ...asset, type: "text/html" }] },
        "client-a",
      ),
    ).toThrow();
  });
  it("cannot skip review", () =>
    expect(() =>
      transition("draft", "approved", true, { assets: [asset] }),
    ).toThrow("etapa"));
  it("requires an approver and media", () => {
    expect(() =>
      transition("review", "approved", false, { assets: [asset] }),
    ).toThrow("gestor");
    expect(() =>
      transition("review", "approved", true, { assets: [] }),
    ).toThrow("arquivos");
  });
  it("permits internal approval", () =>
    expect(transition("review", "approved", true, { assets: [asset] })).toBe(
      "approved",
    ));
  it("requires an actual Instagram publication URL for manual confirmation", () => {
    expect(() =>
      transition("approved", "published_manual", true, {
        assets: [asset],
        publication_url: "https://evil.invalid/p/abc",
      }),
    ).toThrow();
    expect(() =>
      transition("approved", "published_manual", true, {
        assets: [asset],
        publication_url: "https://www.instagram.com/",
      }),
    ).toThrow();
    expect(
      transition("approved", "published_manual", true, {
        assets: [asset],
        publication_url: "https://www.instagram.com/p/abc123/",
      }),
    ).toBe("published_manual");
  });
  it("does not reopen published content", () =>
    expect(() =>
      transition("published_manual", "draft", true, { assets: [asset] }),
    ).toThrow());
  it("uses Brasília consistently even on a computer in another time zone", () => {
    expect(editorialDate("2026-10-09T01:00:00Z")).toBe("2026-10-08");
    expect(localInput("2026-10-09T01:00:00Z")).toBe("2026-10-08T22:00");
    expect(utcInput("2026-10-08T22:00")).toBe("2026-10-09T01:00:00.000Z");
  });
});
