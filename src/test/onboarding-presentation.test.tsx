import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnboardingPresentation } from "@/lib/onboarding-presentation";
import OnboardingPresentation from "@/components/OnboardingPresentation";
import type { OnboardingResponse } from "@/lib/onboarding-pdf";
import { emptyMeetingPlan } from "@/lib/onboarding-plan";
import { buildOnboardingHtml } from "@/lib/onboarding-html";

const clinic: OnboardingResponse = {
  group_id: "test-only", created_at: "2026-10-06T14:00:00Z", respondent_name: "Clínica exemplo", survey_type: "clinica",
  responses: { clinic_name: "Clínica Horizonte", city: "Lorena", state: "SP", main_treatment: "Implantes", specialties: ["Implantes", "Ortodontia"], ad_budget: [3500], cnpj: "PRIVATE_CNPJ", commercial_email: "PRIVATE_EMAIL", password: "PRIVATE_PASSWORD" },
};
afterEach(cleanup);

describe("client onboarding presentation", () => {
  it("uses saved clinic answers, preserves the source, and excludes unselected sensitive fields", () => {
    const before = JSON.stringify(clinic);
    const deck = createOnboardingPresentation(clinic, "Grupo");
    expect(deck.clientName).toBe("Clínica Horizonte");
    expect(deck.chapters[0].facts[1].value).toBe("Lorena / SP");
    expect(deck.chapters[3].facts[1].value).toBe("Implantes · Ortodontia");
    expect(deck.chapters[4].facts[0].value.replace(/\s/g, " ")).toBe("R$ 3.500");
    expect(JSON.stringify(deck)).not.toMatch(/PRIVATE_/);
    expect(JSON.stringify(clinic)).toBe(before);
  });

  it("adapts vocabulary and products for non-clinic clients", () => {
    const deck = createOnboardingPresentation({ ...clinic, survey_type: "generico", responses: { business_name: "Empresa Solar", services_list: "Instalação e manutenção" } }, "Grupo");
    expect(deck.clientName).toBe("Empresa Solar");
    expect(deck.chapters[3].facts[1].value).toBe("Instalação e manutenção");
    expect(JSON.stringify(deck)).not.toMatch(/Tratamento prioritário|Especialidades|Meta de consultas/);
  });

  it("does not fabricate missing budgets, goals, or dates", () => {
    const deck = createOnboardingPresentation({ ...clinic, created_at: "invalid", responses: { ad_budget: [], leads_goal: null } }, "Grupo");
    expect(deck.chapters[4].facts[0]).toMatchObject({ missing: true, value: "A confirmar na reunião" });
    expect(deck.chapters[4].facts[2].missing).toBe(true);
    expect(deck.submittedAt).toBe("Data indisponível");
    expect(deck.chapters.at(-1)?.description).toContain("precisam ser confirmados");
  });

  it("preserves an explicit zero budget and locale-formatted free text", () => {
    const zero = createOnboardingPresentation({ ...clinic, responses: { ad_budget: [0] } }, "Grupo");
    expect(zero.chapters[4].facts[0]).toMatchObject({ missing: false });
    const text = createOnboardingPresentation({ ...clinic, responses: { ad_budget: "R$ 2.500,50" } }, "Grupo");
    expect(text.chapters[4].facts[0].value).toBe("R$ 2.500,50");
  });

  it("navigates chapters with buttons and keyboard, and closes without submitting anything", () => {
    const close = vi.fn();
    render(<OnboardingPresentation response={clinic} groupName="Grupo" onClose={close} />);
    expect(screen.getByRole("button", { name: "Capítulo anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByRole("heading", { name: "O que queremos construir." })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "Clínica Horizonte" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /10.*Próximos passos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("renders response HTML as text instead of executable content", () => {
    const unsafe = '<img src=x onerror="alert(1)">';
    render(<OnboardingPresentation response={{ ...clinic, responses: { clinic_name: unsafe } }} groupName="Grupo" onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: unsafe })).toBeInTheDocument();
    expect(document.querySelector(".nv-presentation img[onerror]")).toBeNull();
    expect(screen.getByAltText("Newvox")).toBeInTheDocument();
  });
});

describe("meeting preparation", () => {
  afterEach(() => localStorage.clear());
  it("adds access, responsibilities and a plan without fabricating agreements", () => {
    const deck = createOnboardingPresentation(clinic, "Grupo");
    expect(deck.chapters).toHaveLength(10);
    expect(deck.chapters.find(c => c.id === "acessos")?.description).toContain("Nunca envie senhas");
    expect(deck.chapters.find(c => c.id === "rotina")?.facts[0].missing).toBe(true);
    const plan = { ...emptyMeetingPlan(), agencyOwner: "Gestora exemplo", scope: "Gestão de campanhas acordada em reunião" };
    const customized = createOnboardingPresentation(clinic, "Grupo", plan);
    expect(customized.chapters.find(c => c.id === "rotina")?.facts[0]).toMatchObject({ value: "Gestora exemplo", missing: false });
    expect(clinic.responses.agencyOwner).toBeUndefined();
  });

  it("edits and saves a local draft scoped to the operator, client and response", () => {
    const view = render(<OnboardingPresentation response={clinic} groupName="Grupo" ownerId="operator-a" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizar reunião" }));
    const input = screen.getByLabelText("Responsável Newvox");
    fireEvent.change(input, { target: { value: "Gestora exemplo" } });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByLabelText("Responsável Newvox")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho e apresentar" }));
    expect(localStorage.length).toBe(1);
    const key = localStorage.key(0)!;
    expect(key).toContain("operator-a:test-only:");
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ agencyOwner: "Gestora exemplo" });
    view.unmount();
    render(<OnboardingPresentation response={clinic} groupName="Grupo" ownerId="operator-b" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizar reunião" }));
    expect(screen.getByLabelText("Responsável Newvox")).toHaveValue("");
  });

  it("exports only the reviewed deck as escaped, offline HTML", () => {
    const deck = createOnboardingPresentation({ ...clinic, responses: { ...clinic.responses, clinic_name: '<img src=x onerror="alert(1)">' } }, "Grupo");
    const html = buildOnboardingHtml(deck, "https://untrusted.example/logo.png");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain("untrusted.example");
    expect(html).toContain("default-src 'none'");
  });
});
