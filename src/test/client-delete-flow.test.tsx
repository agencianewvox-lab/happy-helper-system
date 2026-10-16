import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDetailModal } from "@/components/ClientDetailModal";
import type { Grupo } from "@/types/client";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(), workspace: vi.fn(), toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "operator" } }) }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({isMaster: true}) }));
vi.mock("@/components/ClientWorkspace", () => ({ClientWorkspace: () => null}));
vi.mock("@/lib/client-workspace", () => ({clientWorkspace: mocks.workspace}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/MetaAdsTab", () => ({ MetaAdsTab: () => null }));
vi.mock("@/components/NpsSurveyTab", () => ({ NpsSurveyTab: () => null }));
vi.mock("@/components/ClientNotesTab", () => ({ ClientNotesTab: () => null }));
vi.mock("@/components/OnboardingTab", () => ({ OnboardingTab: () => null }));
vi.mock("@/components/OnboardingSendDialog", () => ({ OnboardingSendDialog: () => null }));
vi.mock("@/components/ClientHealth", () => ({ ClientHealthPanel: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => ({
    select: () => {
      const query = {
        eq: () => query, order: () => query,
        single: async () => ({ data: null, error: null }),
        range: async () => ({ data: [], error: null }),
      };
      return query;
    },
    delete: () => ({
      eq: (column: string, value: string) => table === "whatsapp_grupos"
        ? { select: () => mocks.remove(table, column, value) }
        : mocks.remove(table, column, value),
    }),
  }) },
}));

const client: Grupo = {
  id: "client-a", group_id: "group-a@g.us", nome: "Cliente de teste",
  categoria: "Clínicas", created_at: "2026-10-01T12:00:00Z",
  total_mensagens: 0, mensagens_hoje: 0, ultima_mensagem: null, ultimo_horario: null,
  sla_violated: false, sla_delay_minutes: 0, investimento_ads: null,
  investimento_google_ads: null, plataforma_ads: null, data_ciclo_ads: null,
  gestor_responsavel: null, estrelas_dificuldade: null, estrelas_financeiro: null,
  estrelas_temperamento: null,
};
const openWarning = () => fireEvent.click(screen.getByRole("button", { name: "Arquivar cliente" }));
const confirm = () => {
  fireEvent.change(screen.getByLabelText("Digite ARQUIVAR para confirmar"), { target: { value: "ARQUIVAR" } });
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Arquivar cliente" }));
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ok:true});
  mocks.remove.mockResolvedValue({ error: null, data: [{ id: "client-a" }] });
});

describe("Client card archive integration (mock database only)", () => {
  it("opening and cancelling the warning issues no delete request", async () => {
    render(<ClientDetailModal grupo={client} open onClose={vi.fn()} />);
    openWarning();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(client.nome);
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar, manter cliente" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("archives only the selected client after explicit confirmation", async () => {
    const close = vi.fn();
    render(<ClientDetailModal grupo={client} open onClose={close} />);
    openWarning();
    confirm();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.workspace).toHaveBeenCalledWith("archive",client.id);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not remove the card or report success when a related deletion fails", async () => {
    mocks.workspace.mockRejectedValue(new Error("denied"));
    const close = vi.fn();
    render(<ClientDetailModal grupo={client} open onClose={close} />);
    openWarning();
    confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar");
    expect(mocks.remove.mock.calls.some(([table]) => table === "whatsapp_grupos")).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("does not claim success if the database did not confirm removal of the card", async () => {
    mocks.workspace.mockResolvedValue({ok:false});
    render(<ClientDetailModal grupo={client} open onClose={vi.fn()} />);
    openWarning();
    confirm();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("drops an open confirmation when switching clients", async () => {
    const close = vi.fn();
    const { rerender } = render(<ClientDetailModal grupo={client} open onClose={close} />);
    openWarning();
    fireEvent.change(screen.getByLabelText("Digite ARQUIVAR para confirmar"), { target: { value: "ARQUIVAR" } });
    await act(async () => {
      rerender(<ClientDetailModal grupo={{ ...client, id: "client-b", group_id: "group-b@g.us", nome: "Outro cliente" }} open onClose={close} />);
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => openWarning());
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Outro cliente");
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Arquivar cliente" })).toBeDisabled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
