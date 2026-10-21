import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeetingConnect from "@/pages/MeetingConnect";
const state = vi.hoisted(() => ({
  user: { id: "manager" } as { id: string } | null,
  role: "gestor",
  call: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, loading: false }),
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: { role: state.role, full_name: "Gestor Teste" },
    loading: false,
    isAdmin: false,
    isMaster: false,
  }),
}));
vi.mock("@/lib/meetings", () => ({ meetingsApi: state.call }));
describe("meeting pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: "manager" };
    state.role = "gestor";
    state.call.mockResolvedValue({ status: "pending" });
    window.history.replaceState(
      null,
      "",
      "/#deviceId=c0a67bd7-cd1d-4196-b6f0-21f8b54cf67a&challenge=" +
        "a".repeat(64) +
        "&label=Notebook&version=1.0.0",
    );
  });
  it("never authorizes on page load and requires explicit confirmation", async () => {
    render(
      <MemoryRouter>
        <MeetingConnect />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", {
      name: "Autorizar esta instalação",
    });
    expect(button).toBeDisabled();
    expect(state.call).not.toHaveBeenCalled();
    expect(screen.getByText("AAAAAAAA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await waitFor(() => expect(state.call).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("aprovação");
    expect(window.location.hash).toBe("");
  });
  it("denies social media", () => {
    state.role = "social_media";
    render(
      <MemoryRouter>
        <MeetingConnect />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("exclusiva");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
  });
  it("uses panel login and never collects passwords", () => {
    state.user = null;
    render(
      <MemoryRouter>
        <MeetingConnect />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "Entrar no painel" }),
    ).toHaveAttribute("href", "/login");
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
  });
  it("rejects malformed challenge links", () => {
    window.history.replaceState(null, "", "/#challenge=not-a-secret");
    render(
      <MemoryRouter>
        <MeetingConnect />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("inválida");
    expect(state.call).not.toHaveBeenCalled();
  });
});
