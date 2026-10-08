// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  exchangeInstagram,
  loginUrl,
  newState,
  stateHash,
  INSTAGRAM_REDIRECT,
} from "../../supabase/functions/_shared/social-instagram";
describe("Panel Instagram OAuth", () => {
  it("uses an independent fixed callback and only publishing scopes", () => {
    const url = new URL(loginUrl("123456", "a".repeat(43)));
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("redirect_uri")).toBe(INSTAGRAM_REDIRECT);
    expect(url.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_content_publish",
    );
    expect(url.searchParams.get("scope")).not.toContain("manage_messages");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
  it("rejects invalid app IDs", () =>
    expect(() => loginUrl("https://bad.invalid", "a".repeat(43))).toThrow());
  it("creates unique random state and stores only a digest", async () => {
    const a = newState(),
      b = newState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    const h = await stateHash(a);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain(a);
  });
  it("rejects malformed state", async () => {
    await expect(stateHash("bad")).rejects.toThrow("inválida");
  });
  it("exchanges tokens only at fixed server endpoints", async () => {
    const responses = [
      {
        access_token: "short-secret",
        permissions: ["instagram_business_content_publish"],
      },
      { access_token: "long-secret", expires_in: 3600 },
      {
        user_id: "17841412345678901",
        username: "cliente_a",
        account_type: "BUSINESS",
      },
    ];
    const request = vi.fn(async () =>
      Response.json(responses.shift()),
    ) as unknown as typeof fetch;
    const result = await exchangeInstagram(
      "single-use-code",
      "123",
      "app-secret",
      request,
    );
    expect(result.id).toBe("17841412345678901");
    expect(result.canPublish).toBe(true);
    expect(result.token).toBe("long-secret");
    const calls = vi.mocked(request).mock.calls;
    expect(calls[0][0]).toBe("https://api.instagram.com/oauth/access_token");
    expect(String(calls[0][1]?.body)).toContain(
      "redirect_uri=" + encodeURIComponent(INSTAGRAM_REDIRECT),
    );
    expect(calls[2][1]?.headers).toEqual({
      Authorization: "Bearer long-secret",
    });
    expect(calls.every((c) => c[1]?.redirect === "error")).toBe(true);
  });
  it("does not claim publishing permission when the provider did not confirm it", async () => {
    const responses = [
      { access_token: "a" },
      { access_token: "b", expires_in: 1000 },
      { user_id: "123", username: "cliente" },
    ];
    const request = vi.fn(async () =>
      Response.json(responses.shift()),
    ) as unknown as typeof fetch;
    expect(
      (await exchangeInstagram("code", "123", "secret", request)).canPublish,
    ).toBe(false);
  });
  it("does not leak provider error content or secrets", async () => {
    const request = vi.fn(async () =>
      Response.json(
        { error: { message: "app-secret long-secret" } },
        { status: 400 },
      ),
    ) as unknown as typeof fetch;
    await expect(
      exchangeInstagram("code", "123", "app-secret", request),
    ).rejects.toThrow("A Meta não concluiu");
    try {
      await exchangeInstagram("code", "123", "app-secret", request);
    } catch (e) {
      expect(String(e)).not.toContain("app-secret");
    }
  });
  it("identifies rejected callback without exposing provider content", async () => {
    const request = vi.fn(async () => Response.json({error:{code:100,message:"redirect_uri mismatch secret-token"}},{status:400})) as unknown as typeof fetch;
    await expect(exchangeInstagram("code","123","secret",request)).rejects.toThrow("endereço de retorno");
  });
  it("identifies the failing long-lived token step", async () => {
    const responses = [Response.json({access_token:"short"}),Response.json({error:{code:190,message:"Invalid token"}},{status:400})];
    const request = vi.fn(async () => responses.shift()!) as unknown as typeof fetch;
    await expect(exchangeInstagram("code","123","secret",request)).rejects.toThrow("autorização duradoura; HTTP 400; código 190");
  });
  it("rejects missing expiry", async () => {
    const responses = [{ access_token: "a" }, { access_token: "b" }];
    const request = vi.fn(async () =>
      Response.json(responses.shift()),
    ) as unknown as typeof fetch;
    await expect(
      exchangeInstagram("code", "123", "secret", request),
    ).rejects.toThrow("válida");
  });
  it("rejects rounded numeric Instagram IDs", async () => {
    const responses = [
      { access_token: "a" },
      { access_token: "b", expires_in: 1000 },
      { user_id: Number("17841412345678901"), username: "cliente" },
    ];
    const request = vi.fn(async () =>
      Response.json(responses.shift()),
    ) as unknown as typeof fetch;
    await expect(
      exchangeInstagram("code", "123", "secret", request),
    ).rejects.toThrow("Identificador");
  });
});
