import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaAdsTab } from "@/components/MetaAdsTab";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), update: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
afterEach(cleanup);

describe("Meta account persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const read = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue({ data: { ad_account_id: null }, error: null }) };
    read.select.mockReturnValue(read); read.eq.mockReturnValue(read);
    const write = { eq: vi.fn(), select: vi.fn(), single: mocks.update };
    write.eq.mockReturnValue(write); write.select.mockReturnValue(write);
    mocks.from.mockReturnValue({ ...read, update: () => write });
    mocks.invoke.mockResolvedValue({ data: { accounts: [{ account_id: "123", name: "Conta de exemplo", currency: "BRL", account_status: 1 }] }, error: null });
  });
  it("does not claim a link succeeded when the database rejected it", async () => {
    mocks.update.mockResolvedValue({ data: null, error: new Error("RLS denied") });
    render(<MetaAdsTab grupoId="group" grupoDbId="db-id" />);
    fireEvent.click(await screen.findByRole("button", { name: /Conta de exemplo/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("não foi vinculada")));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByText("Selecione a Conta de Anúncios")).toBeInTheDocument();
  });
  it("requires a returned persisted row before confirming the link", async () => {
    mocks.update.mockResolvedValue({ data: { id: "db-id" }, error: null });
    const changed = vi.fn();
    render(<MetaAdsTab grupoId="group" grupoDbId="db-id" onAccountChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: /Conta de exemplo/ }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Conta de anúncios vinculada ao cliente."));
    expect(changed).toHaveBeenCalledOnce();
  });
});
