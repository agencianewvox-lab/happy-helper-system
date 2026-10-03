import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddClientDialog } from "@/components/AddClientDialog";

const mocks = vi.hoisted(() => ({
  discovery: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn(), toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/lib/whatsapp", () => ({ whatsappRequest: mocks.discovery }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({
    insert: mocks.insert,
    select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
  }) },
}));
const renderDialog = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AddClientDialog /></QueryClientProvider>);
const openDialog = () => fireEvent.click(screen.getByRole("button", { name: "Novo Cliente" }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.discovery.mockResolvedValue({ groups: [
    { group_id: "456@g.us", nome: "Clínica Ágil", createdAt: new Date().toISOString(), lastMessageAt: null, participants: 5 },
    { group_id: "789@g.us", nome: "Grupo antigo", createdAt: "2020-01-01T00:00:00Z", lastMessageAt: null, participants: 4 },
  ], activityAvailable: true, registeredCount: 2, checkedAt: new Date().toISOString() });
});
describe("Simple client registration", () => {
  it("does not fetch groups while the dashboard dialog is closed", async () => {
    renderDialog();
    expect(mocks.discovery).not.toHaveBeenCalled();
    openDialog();
    expect(await screen.findByRole("button", { name: "Selecionar Clínica Ágil" })).toBeInTheDocument();
    expect(mocks.discovery).toHaveBeenCalledWith(undefined, "discover-groups");
  });
  it("selects an exact ID, permits renaming and writes only after confirmation", async () => {
    renderDialog();
    openDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Selecionar Clínica Ágil" }));
    expect(screen.getByLabelText("Nome no painel *")).toHaveValue("Clínica Ágil");
    expect(mocks.insert).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nome no painel *"), { target: { value: "Meu cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({ nome: "Meu cliente", group_id: "456@g.us", categoria: null, gestor_responsavel: null }));
    expect(mocks.toast.success).toHaveBeenCalled();
  });
  it("searches without requiring accents and keeps older groups accessible", async () => {
    renderDialog();
    openDialog();
    await screen.findByRole("button", { name: "Selecionar Clínica Ágil" });
    fireEvent.change(screen.getByLabelText("Buscar grupo do WhatsApp"), { target: { value: "clinica agil" } });
    expect(screen.getByRole("button", { name: "Selecionar Clínica Ágil" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Selecionar Grupo antigo" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar grupo do WhatsApp"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Recentes · 30 dias" }));
    expect(screen.queryByRole("button", { name: "Selecionar Grupo antigo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todos não cadastrados" }));
    expect(screen.getByRole("button", { name: "Selecionar Grupo antigo" })).toBeInTheDocument();
  });
  it("prevents duplicating a card registered after the list was loaded", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "existing-card" }, error: null });
    renderDialog();
    openDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Selecionar Clínica Ágil" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("duplicado")));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("offers a retry and manual fallback when Evolution is unavailable", async () => {
    mocks.discovery.mockRejectedValue(new Error("Evolution indisponível"));
    renderDialog();
    openDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Evolution indisponível");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Cadastro manual" }), { button: 0, ctrlKey: false });
    expect(await screen.findByLabelText("ID do grupo (opcional)")).toBeInTheDocument();
  });
  it("handles a database uniqueness race without reporting success", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    renderDialog();
    openDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Selecionar Clínica Ágil" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("acabou de ser cadastrado")));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirmar cadastro" })).toBeEnabled();
  });
  it("preserves manual registration when the group is not in the list", async () => {
    renderDialog();
    openDialog();
    await screen.findByRole("button", { name: "Selecionar Clínica Ágil" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Cadastro manual" }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByLabelText("Nome no painel *"), { target: { value: "Grupo manual" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({
      nome: "Grupo manual", group_id: expect.stringMatching(/^placeholder-grupo-manual-/), categoria: null, gestor_responsavel: null,
    }));
  });
});
