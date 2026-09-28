import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingTab } from "@/components/OnboardingTab";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));
vi.mock("@/lib/onboarding-pdf", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/onboarding-pdf")>(),
  downloadOnboardingPdf: mocks.download,
}));

describe("OnboardingTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.download.mockResolvedValue(undefined);
  });

  it("shows the PDF action only when a completed onboarding exists", async () => {
    const answer = {
      created_at: "2026-09-28T15:00:00.000Z",
      group_id: "123@g.us",
      respondent_name: "Clínica São José",
      survey_type: "clinica",
      responses: { clinic_name: "Clínica São José" },
    };
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [answer], error: null }),
          }),
        }),
      }),
    });

    render(<OnboardingTab groupId="123@g.us" groupName="Grupo Lorena" />);
    const button = await screen.findByRole("button", { name: "Baixar PDF" });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(answer, "Grupo Lorena"));
  });

  it("does not offer a PDF for a client who has not answered", async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    });

    render(<OnboardingTab groupId="456@g.us" groupName="Grupo Cunha" />);
    expect(await screen.findByText("Nenhum onboarding preenchido ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Baixar PDF" })).not.toBeInTheDocument();
  });
});
