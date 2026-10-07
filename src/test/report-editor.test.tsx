import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportEditor } from "@/components/reports/ReportEditor";
import { reportsApi } from "@/lib/reports";
vi.mock("@/lib/reports", async () => ({
  ...(await vi.importActual("@/lib/reports")),
  reportsApi: vi.fn(),
}));
const client = {
  id: "00000000-0000-0000-0000-000000000001",
  nome: "Client A",
  group_id: "123@g.us",
  ad_account_id: null,
  gestor_responsavel: "Manager",
};
const userId = "00000000-0000-0000-0000-000000000002";
const source = {
  client_id: client.id,
  crm_account_id: userId,
  pipeline_ids: [],
  pipeline_only: null,
  version: 1,
};
function view(extra: any = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReportEditor
        client={client}
        source={source}
        master={false}
        userId={userId}
        profiles={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        {...extra}
      />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("report configuration UI", () => {
  it("lets a customer without CRM configure a Meta-only report", async () => {
    vi.mocked(reportsApi).mockResolvedValue({
      pipelines: [],
      stages: [],
      campaigns: [],
    });
    view({ source: undefined, client: { ...client, ad_account_id: "123" } });
    expect(screen.getByLabelText("Fontes do relatório")).toHaveValue("meta");
    expect(
      screen.getByRole("button", { name: "Salvar configuração" }),
    ).toBeEnabled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "5. Prévia" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await screen.findByRole("button", {
        name: "Gerar prévia com dados reais",
      }),
    ).toBeEnabled();
    expect(
      vi.mocked(reportsApi).mock.calls.some((c) => c[0].action === "send"),
    ).toBe(false);
  });
  it("inserts message variables and flags unknown tokens", async () => {
    vi.mocked(reportsApi).mockResolvedValue({
      pipelines: [],
      stages: [],
      campaigns: [],
    });
    view();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "3. Mensagem" }), {
      button: 0,
      ctrlKey: false,
    });
    const input = await screen.findByLabelText("Mensagem personalizada");
    fireEvent.change(input, { target: { value: "Investimento: " } });
    fireEvent.click(
      screen.getByRole("button", { name: "Investimento · Meta" }),
    );
    expect(input).toHaveValue("Investimento: {{investimento}}");
    fireEvent.change(input, { target: { value: "{{unknown}}" } });
    expect(screen.getByRole("alert")).toHaveTextContent("unknown");
    expect(
      screen.getByRole("button", { name: "Salvar configuração" }),
    ).toBeDisabled();
  });
  it("starts paused and only queries the selected client catalog", async () => {
    vi.mocked(reportsApi).mockResolvedValue({ pipelines: [], stages: [] });
    view();
    expect(screen.getByText("Envio automático pausado")).toBeInTheDocument();
    await waitFor(() =>
      expect(reportsApi).toHaveBeenCalledWith({
        action: "client-catalog",
        clientId: client.id,
      }),
    );
    expect(
      vi.mocked(reportsApi).mock.calls.some((c) => c[0].action === "send"),
    ).toBe(false);
  });
  it("requires Master confirmation before associating a CRM account", async () => {
    vi.mocked(reportsApi).mockResolvedValue({
      accounts: [{ id: userId, name: "CRM Company" }],
      pipelines: [],
      stages: [],
    });
    view({
      source: undefined,
      master: true,
      profiles: [{ user_id: userId, full_name: "Master" }],
    });
    const confirm = screen.getByRole("button", {
      name: "Confirmar vínculo seguro",
    });
    expect(confirm).toBeDisabled();
    await screen.findByRole("option", { name: /CRM Company/ });
    fireEvent.change(screen.getByLabelText("Conta principal no Voxi"), {
      target: { value: userId },
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Conferi que esta conta CRM/));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(reportsApi).toHaveBeenCalledWith({
        action: "bind-source",
        clientId: client.id,
        accountId: userId,
        confirm: true,
      }),
    );
  });
  it("managers cannot replace source accounts", () => {
    vi.mocked(reportsApi).mockResolvedValue({ pipelines: [], stages: [] });
    view({ source: undefined });
    expect(
      screen.queryByLabelText("Conta principal no Voxi"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Solicite ao Master/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar configuração" }),
    ).toBeDisabled();
  });
});
