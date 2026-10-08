import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { StrictMode } from "react";
import InstagramReturn from "@/pages/InstagramReturn";
import { InstagramAccounts } from "@/components/social/InstagramAccounts";
import { instagramApi } from "@/lib/social-instagram";
vi.mock("@/lib/social-instagram", () => ({ instagramApi: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "staff-a" }, loading: false }),
}));
function view(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});
describe("Instagram connection interface", () => {
  it("exchanges once under StrictMode and waits for explicit client confirmation", async () => {
    window.history.replaceState(
      {},
      "",
      "/social/instagram/retorno?code=once&state=" + "a".repeat(43),
    );
    vi.mocked(instagramApi).mockResolvedValue({
      clientId: "client-a",
      clientName: "Cliente A",
      username: "perfil_a",
      canPublish: true,
      expiresAt: "2026-12-01T12:00:00Z",
    });
    view(<InstagramReturn />);
    await screen.findByText("@perfil_a");
    expect(window.location.search).toBe("");
    expect(instagramApi).toHaveBeenCalledTimes(1);
    expect(instagramApi).toHaveBeenCalledWith({
      action: "exchange",
      code: "once",
      state: "a".repeat(43),
    });
    fireEvent.click(screen.getByText("Confirmar vínculo com este cliente"));
    await screen.findByText("Instagram conectado");
    expect(instagramApi).toHaveBeenLastCalledWith({
      action: "confirm",
      state: "a".repeat(43),
    });
  });
  it("does not exchange denied authorization", async () => {
    window.history.replaceState(
      {},
      "",
      "/social/instagram/retorno?error=access_denied",
    );
    view(<InstagramReturn />);
    await screen.findByRole("alert");
    expect(instagramApi).not.toHaveBeenCalled();
  });
  it("disables connection for members without approval permission", async () => {
    vi.mocked(instagramApi).mockResolvedValue({
      configured: true,
      accounts: [],
      redirectUri:
        "https://paineldecontrole.newvox.site/social/instagram/retorno",
    });
    view(
      <InstagramAccounts
        clients={[{ id: "client-a", nome: "Cliente A", can_approve: false }]}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText("Consultando conexões…")).toBeNull(),
    );
    expect(screen.getByText("Conectar Instagram")).toBeDisabled();
  });
});
