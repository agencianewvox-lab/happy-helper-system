import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPresentation from "@/components/OnboardingPresentation";
import { emptyMeetingPlan } from "@/lib/onboarding-plan";
import { MeetingPlanStoreError } from "@/lib/onboarding-plan-store";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/onboarding-plan-supabase", () => ({ sharedMeetingPlanStore: api }));
const response = { id: "10000000-0000-4000-8000-000000000001", group_id: "fixture@g.us", created_at: "2026-10-06T12:00:00Z", respondent_name: "Exemplo", survey_type: "clinica", responses: { clinic_name: "Clínica Exemplo" } };
const saved = { response_id: response.id, group_id: response.group_id, plan: { ...emptyMeetingPlan(), agencyOwner: "Gestora da equipe" }, version: 3, updated_at: "2026-10-06T12:00:00Z", updated_by: "20000000-0000-4000-8000-000000000002" };
beforeEach(() => { vi.stubEnv("VITE_ONBOARDING_SYNC_ENABLED", "true"); vi.clearAllMocks(); api.load.mockResolvedValue(saved); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllEnvs(); });
describe("shared onboarding UI, enabled only after permission validation", () => {
  it("loads the team plan and saves with its version, without local-only success", async () => {
    api.save.mockResolvedValue({ ...saved, version: 4 });
    render(<OnboardingPresentation response={response} groupName="Grupo" ownerId="operator" onClose={vi.fn()} />);
    await screen.findByText("Plano da equipe · versão 3");
    fireEvent.click(screen.getByRole("button", { name: "Personalizar reunião" }));
    expect(screen.getByLabelText("Responsável Newvox")).toHaveValue("Gestora da equipe");
    fireEvent.click(screen.getByRole("button", { name: "Salvar plano e apresentar" }));
    await screen.findByText("Plano da equipe · versão 4");
    expect(api.save).toHaveBeenCalledWith(response.id, response.group_id, saved.plan, 3);
    expect(localStorage.length).toBe(0);
  });
  it("keeps edits visible after a conflict and never automatically retries an overwrite", async () => {
    api.save.mockRejectedValue(new MeetingPlanStoreError("conflict"));
    render(<OnboardingPresentation response={response} groupName="Grupo" ownerId="operator" onClose={vi.fn()} />);
    await screen.findByText("Plano da equipe · versão 3");
    fireEvent.click(screen.getByRole("button", { name: "Personalizar reunião" }));
    fireEvent.change(screen.getByLabelText("Responsável Newvox"), { target: { value: "Minha revisão" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar plano e apresentar" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Responsável Newvox")).toHaveValue("Minha revisão");
    expect(screen.getByRole("button", { name: "Salvar plano e apresentar" })).toBeDisabled();
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it("blocks cloud editing on load failure instead of silently saving a local draft", async () => {
    api.load.mockRejectedValue(new MeetingPlanStoreError("denied"));
    render(<OnboardingPresentation response={response} groupName="Grupo" ownerId="operator" onClose={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Personalizar reunião" })).toBeDisabled();
    expect(api.save).not.toHaveBeenCalled();
  });
  it("ignores a late load after switching to another client", async () => {
    let finish: (value: typeof saved) => void;
    api.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...saved, plan: { ...saved.plan, agencyOwner: "Outra gestora" } });
    const view = render(<OnboardingPresentation response={response} groupName="Grupo" ownerId="operator" onClose={vi.fn()} />);
    await waitFor(() => expect(api.load).toHaveBeenCalledTimes(1));
    view.rerender(<OnboardingPresentation response={{ ...response, id: "10000000-0000-4000-8000-000000000002", group_id: "other@g.us" }} groupName="Outro" ownerId="operator" onClose={vi.fn()} />);
    await screen.findByText("Plano da equipe · versão 3");
    await act(async () => { finish(saved); });
    fireEvent.click(screen.getByRole("button", { name: "Personalizar reunião" }));
    expect(screen.getByLabelText("Responsável Newvox")).toHaveValue("Outra gestora");
  });
  it("makes no backend request when the feature is disabled", async () => {
    vi.stubEnv("VITE_ONBOARDING_SYNC_ENABLED", "false");
    render(<OnboardingPresentation response={response} groupName="Grupo" ownerId="operator" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizar reunião" }));
    expect(screen.getByRole("button", { name: "Salvar rascunho e apresentar" })).toBeInTheDocument();
    expect(api.load).not.toHaveBeenCalled();
  });
});
