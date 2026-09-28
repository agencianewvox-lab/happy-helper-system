import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClientData } from "@/hooks/useClientData";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, channel: mocks.channel, removeChannel: mocks.removeChannel, functions: { invoke: mocks.invoke } },
}));

describe("useClientData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const subscription = { on: vi.fn(), subscribe: vi.fn() };
    subscription.on.mockReturnValue(subscription);
    subscription.subscribe.mockReturnValue(subscription);
    mocks.channel.mockReturnValue(subscription);
    mocks.invoke.mockResolvedValue({ data: { analytics: {} }, error: null });
  });

  it("shows client cards while message statistics continue loading", async () => {
    let resolveGroups!: (value: unknown) => void;
    let resolveMessages!: (value: unknown) => void;
    const groupsRequest = new Promise((resolve) => { resolveGroups = resolve; });
    const messagesRequest = new Promise((resolve) => { resolveMessages = resolve; });
    mocks.from.mockImplementation((table: string) => table === "whatsapp_grupos"
      ? { select: () => ({ order: () => groupsRequest }) }
      : { select: () => ({ order: () => ({ range: () => messagesRequest }) }) });

    const { result } = renderHook(() => useClientData());
    expect(result.current.loading).toBe(true);

    act(() => resolveGroups({ data: [{ id: "1", group_id: "123@g.us", nome: "Clínica de teste", categoria: "Clínicas", created_at: "2026-09-28T00:00:00Z" }], error: null }));
    await waitFor(() => expect(result.current.grupos).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    expect(result.current.messagesLoading).toBe(true);
    expect(result.current.hasMessageStats).toBe(false);

    act(() => resolveMessages({ data: [], count: 0, error: null }));
    await waitFor(() => expect(result.current.hasMessageStats).toBe(true));
    expect(result.current.messagesLoading).toBe(false);
  });
});
