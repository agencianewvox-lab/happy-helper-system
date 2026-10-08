import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SocialEditor } from "@/components/social/SocialEditor";
import { EditorialCalendar } from "@/components/social/EditorialCalendar";
import { socialApi, type SocialPost } from "@/lib/social";
vi.mock("@/lib/social", async () => ({
  ...(await vi.importActual("@/lib/social")),
  socialApi: vi.fn(),
}));
const post: SocialPost = {
  id: "post-a",
  client_id: "client-a",
  title: "Conteúdo A",
  format: "image",
  briefing: "Brief",
  caption: "Legenda",
  assets: [
    { path: "client-a/asset.png", name: "Arte", type: "image/png", size: 100 },
  ],
  scheduled_at: "2026-10-08T12:00:00Z",
  status: "review",
  version: 2,
  approved_at: null,
  publication_url: null,
  updated_at: "2026-10-08T12:00:00Z",
};
function view(initial: SocialPost | null = post, canApprove = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const saved = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <SocialEditor
        initial={initial}
        client={{ id: "client-a", nome: "Cliente A", can_approve: canApprove }}
        userId="editor-a"
        onClose={vi.fn()}
        onSaved={saved}
      />
    </QueryClientProvider>,
  );
  return saved;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Social editorial interface", () => {
  it("creates content in the explicit client without invoking publication", async () => {
    vi.mocked(socialApi).mockResolvedValue({
      post: { ...post, status: "draft", version: 1 },
      assets: [],
      comments: [],
      history: [],
    });
    const saved = view(null);
    fireEvent.change(screen.getByLabelText("Título interno"), {
      target: { value: "Nova arte" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar conteúdo" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(vi.mocked(socialApi).mock.calls[0][0]).toMatchObject({
      action: "save",
      clientId: "client-a",
      content: { title: "Nova arte" },
    });
    expect(
      vi
        .mocked(socialApi)
        .mock.calls.some(([b]) =>
          ["publish", "schedule"].includes(String(b.action)),
        ),
    ).toBe(false);
  });
  it("does not offer approval to a production-only member", () => {
    vi.mocked(socialApi).mockResolvedValue({
      assets: [],
      comments: [],
      history: [],
    });
    view();
    expect(
      screen.queryByRole("button", { name: "Aprovado" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/não dispara uma publicação automática/),
    ).toBeInTheDocument();
  });
  it("requires saved content before an approver can approve", () => {
    vi.mocked(socialApi).mockResolvedValue({
      assets: [],
      comments: [],
      history: [],
    });
    view(post, true);
    expect(screen.getByRole("button", { name: "Aprovado" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/Legenda/), {
      target: { value: "Alteração" },
    });
    expect(screen.getByRole("button", { name: "Aprovado" })).toBeDisabled();
  });
  it("sends the exact version when approving", async () => {
    vi.mocked(socialApi).mockImplementation(async (b) =>
      b.action === "transition"
        ? { post: { ...post, status: "approved", version: 3 } }
        : { assets: [], comments: [], history: [] },
    );
    view(post, true);
    fireEvent.click(screen.getByRole("button", { name: "Aprovado" }));
    await waitFor(() =>
      expect(socialApi).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "transition",
          postId: "post-a",
          clientId: "client-a",
          version: 2,
          status: "approved",
        }),
      ),
    );
  });
  it("locks editing on a manually published content", () => {
    vi.mocked(socialApi).mockResolvedValue({
      assets: [],
      comments: [],
      history: [],
    });
    view(
      {
        ...post,
        status: "published_manual",
        publication_url: "https://www.instagram.com/p/example/",
      },
      true,
    );
    expect(screen.getByLabelText("Título interno")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Salvar conteúdo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir publicação" }),
    ).toHaveAttribute("href", "https://www.instagram.com/p/example/");
  });
  it("places an item on Brasília calendar date and opens its exact card", () => {
    const select = vi.fn();
    render(
      <EditorialCalendar
        month={new Date(2026, 9, 1)}
        posts={[post]}
        onSelect={select}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Conteúdo A/ }));
    expect(select).toHaveBeenCalledWith(post);
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });
});
