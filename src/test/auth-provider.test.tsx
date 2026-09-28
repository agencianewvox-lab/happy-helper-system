import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

const { onAuthStateChange, unsubscribe } = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange, signOut: vi.fn() } },
}));

function SessionLabel() {
  const { user, loading, recoveryPending } = useAuth();
  return <span>{loading ? "Carregando" : recoveryPending ? "Recuperação: " + user?.id : user?.id ?? "Sem sessão"}</span>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares one Supabase auth subscription across all consumers", () => {
    let listener: (event: string, session: unknown) => void = () => {};
    onAuthStateChange.mockImplementation((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    });

    const view = render(<AuthProvider><SessionLabel /><SessionLabel /></AuthProvider>);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Carregando")).toHaveLength(2);

    act(() => listener("INITIAL_SESSION", { access_token: "test-token", user: { id: "user-1" } }));
    expect(screen.getAllByText("user-1")).toHaveLength(2);

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery mode until the local session ends", () => {
    let listener: (event: string, session: unknown) => void = () => {};
    onAuthStateChange.mockImplementation((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    });

    render(<AuthProvider><SessionLabel /></AuthProvider>);
    act(() => listener("PASSWORD_RECOVERY", { access_token: "recovery", user: { id: "priscila-id" } }));
    expect(screen.getByText("Recuperação: priscila-id")).toBeInTheDocument();
    act(() => listener("SIGNED_IN", { access_token: "recovery", user: { id: "priscila-id" } }));
    expect(screen.getByText("Recuperação: priscila-id")).toBeInTheDocument();
    act(() => listener("SIGNED_OUT", null));
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
  });
});
