import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: {
    resetPasswordForEmail: mocks.resetPasswordForEmail,
    getUser: mocks.getUser,
    updateUser: mocks.updateUser,
    signOut: mocks.signOut,
  } },
}));
vi.mock("@/components/ThemePreference", () => ({ ThemePreference: () => null }));
vi.mock("@/assets/newvox-logo.jpg", () => ({ default: "/logo.jpg" }));

describe("password recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    mocks.user = null;
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("offers recovery from login and sends the official domain without exposing account existence", async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Esqueceu sua senha?" }));
    fireEvent.change(screen.getByLabelText("E-mail de acesso"), { target: { value: "priscila@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));

    await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "priscila@example.com",
      { redirectTo: "https://paineldecontrole.newvox.site/redefinir-senha" },
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("Se esse e-mail estiver cadastrado");
  });

  it("does not allow a password update without an authenticated recovery session", () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(screen.getByText(/Este link é inválido/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an expired link even when another account is already signed in", () => {
    mocks.user = { id: "other-user", email: "other@example.com" };
    window.history.replaceState({}, "", "/#error=access_denied&error_code=otp_expired");
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(screen.getByText(/Este link é inválido/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates only the account confirmed by Auth and ends the local session", async () => {
    mocks.user = { id: "priscila-id", email: "priscila@example.com" };
    mocks.getUser.mockResolvedValue({ data: { user: mocks.user }, error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: mocks.user }, error: null });
    render(<MemoryRouter initialEntries={["/redefinir-senha"]}>
      <Routes>
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/login" element={<div>Login novamente</div>} />
      </Routes>
    </MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "UmaFraseForte!2026" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "UmaFraseForte!2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: "UmaFraseForte!2026" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await screen.findByText("Login novamente")).toBeInTheDocument();
  });
});
