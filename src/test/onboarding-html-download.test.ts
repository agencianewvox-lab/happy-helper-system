import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadOnboardingHtml } from "@/lib/onboarding-html";
import { createOnboardingPresentation } from "@/lib/onboarding-presentation";

const deck = createOnboardingPresentation({ group_id: "fixture", created_at: "2026-10-06T14:00:00Z", survey_type: "clinica", respondent_name: "Clínica exemplo", responses: {} }, "Grupo");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("HTML download handoff", () => {
  it("loads the same-origin brand, creates a named document and keeps the URL alive during saving", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["logo"], { type: "image/jpeg" }) }));
    vi.stubGlobal("FileReader", class {
      result = "data:image/jpeg;base64,YQ==";
      onload?: () => void;
      readAsDataURL() { this.onload?.(); }
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:fixture");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    let filename = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      expect(this.isConnected).toBe(true);
      expect(this.href).toBe("blob:fixture");
      filename = this.download;
    });
    await downloadOnboardingHtml(deck, "/assets/newvox-logo.jpg");
    expect(fetch).toHaveBeenCalledWith("/assets/newvox-logo.jpg");
    expect(click).toHaveBeenCalledOnce();
    expect(filename).toBe("Newvox-onboarding-Clínica exemplo.html");
    expect(createObjectURL.mock.calls[0][0].type).toBe("text/html;charset=utf-8");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
  });
  it("fails explicitly instead of creating a partial export if the brand cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await expect(downloadOnboardingHtml(deck, "/assets/newvox-logo.jpg")).rejects.toThrow("carregar a marca");
    expect(click).not.toHaveBeenCalled();
  });
});
