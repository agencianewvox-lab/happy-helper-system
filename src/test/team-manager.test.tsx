import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipeManager } from "@/components/config/EquipeManager";

const state = vi.hoisted(() => ({
  owner: true,
  invoke: vi.fn(),
  read: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ canManageTeam: state.owner }),
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: state.invoke },
    from: () => ({ select: () => ({ order: () => ({ order: state.read }) }) }),
  },
}));
const people = [
  {
    id: "owner",
    full_name: "Master de teste",
    is_master: true,
    role: "admin",
    telefone: null,
  },
  {
    id: "person",
    full_name: "Gestora de teste",
    is_master: false,
    role: "gestor",
    telefone: null,
  },
];

describe("team administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.owner = true;
    state.read.mockResolvedValue({ data: people, error: null });
    state.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  it("does not expose provisioning to an operational ADM", () => {
    state.owner = false;
    render(<EquipeManager />);
    expect(screen.getByRole("alert")).toHaveTextContent("Somente o Master");
    expect(state.read).not.toHaveBeenCalled();
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("creates an ADM only after explicit confirmation, never as Master", async () => {
    render(<EquipeManager />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Adicionar pessoa" }),
    );
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "ADM de teste" },
    });
    fireEvent.change(screen.getByLabelText("E-mail de acesso"), {
      target: { value: "adm@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/Senha inicial/), {
      target: { value: "TESTE-nao-usar-123" },
    });
    fireEvent.change(screen.getByLabelText("Perfil", { exact: true }), {
      target: { value: "admin" },
    });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Criar acesso" }));
    expect(state.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Criar acesso" }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.invoke).toHaveBeenCalledWith("create-team-users", {
      body: {
        name: "ADM de teste",
        email: "adm@example.test",
        password: "TESTE-nao-usar-123",
        role: "admin",
      },
    });
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("cofre de acessos"),
    );
  });
  it("protects Master and sends the expected role for concurrency checking", async () => {
    render(<EquipeManager />);
    const select = await screen.findByLabelText(
      "Perfil de acesso de Gestora de teste",
    );
    expect(
      screen.queryByLabelText("Perfil de acesso de Master de teste"),
    ).toBeNull();
    fireEvent.change(select, { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Alterar perfil" }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.invoke).toHaveBeenCalledWith("create-team-users", {
      body: {
        action: "update_role",
        profileId: "person",
        role: "admin",
        expectedRole: "gestor",
      },
    });
  });
  it("shows a failed role update without claiming success", async () => {
    state.invoke.mockResolvedValue({
      data: { error: "Perfil alterado por outra pessoa." },
      error: null,
    });
    render(<EquipeManager />);
    fireEvent.change(
      await screen.findByLabelText("Perfil de acesso de Gestora de teste"),
      { target: { value: "admin" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Alterar perfil" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        "Perfil alterado por outra pessoa.",
      ),
    );
    expect(state.success).not.toHaveBeenCalled();
  });
});
