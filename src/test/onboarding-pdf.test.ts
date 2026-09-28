import { describe, expect, it } from "vitest";
import {
  createOnboardingPdfDefinition,
  formatOnboardingValue,
  onboardingEntries,
  onboardingFileName,
  type OnboardingResponse,
} from "@/lib/onboarding-pdf";

const response: OnboardingResponse = {
  created_at: "2026-09-28T15:00:00.000Z",
  group_id: "120363433427106426@g.us",
  respondent_name: "Clínica São José",
  survey_type: "clinica",
  responses: {
    clinic_name: "Clínica São José",
    city: "Lorena",
    specialties: ["Ortodontia", "Implantes"],
    ad_budget: [2500],
    terms_accepted: true,
    responsible_role_outro_active: false,
  },
};

describe("onboarding PDF", () => {
  it("formats client responses without leaking internal form flags", () => {
    expect(formatOnboardingValue("ad_budget", [2500])).toBe("R$ 2.500");
    expect(formatOnboardingValue("terms_accepted", true)).toBe("Sim");
    expect(onboardingEntries(response.responses).map((entry) => entry.key))
      .not.toContain("responsible_role_outro_active");
  });

  it("creates a client-specific, safe filename", () => {
    expect(onboardingFileName("Clínica São José 🦷", response.created_at))
      .toBe("onboarding-clinica-sao-jose-2026-09-28.pdf");
  });

  it("includes the saved answers in the document and generates valid PDF bytes", async () => {
    const document = createOnboardingPdfDefinition(response, "Grupo Lorena");
    expect(JSON.stringify(document.content)).toContain("Clínica São José");
    expect(JSON.stringify(document.content)).toContain("Ortodontia, Implantes");
    expect(JSON.stringify(document.content)).toContain("Termos aceitos".toUpperCase());

    const [pdfModule, fontsModule] = await Promise.all([
      import("pdfmake/build/pdfmake.js"),
      import("pdfmake/build/vfs_fonts.js"),
    ]);
    const pdfMake = pdfModule.default ?? pdfModule;
    const fonts = (fontsModule.default ?? fontsModule) as Record<string, string>;
    const bytes = await new Promise<Uint8Array>((resolve) => {
      pdfMake.createPdf(document, undefined, undefined, fonts).getBuffer(resolve);
    });
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
