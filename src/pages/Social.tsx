import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderOpen,
  Instagram,
  LayoutGrid,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SocialEditor } from "@/components/social/SocialEditor";
import { EditorialCalendar } from "@/components/social/EditorialCalendar";
import { InstagramAccounts } from "@/components/social/InstagramAccounts";
import {
  editorialDate,
  formatLabels,
  socialApi,
  statusLabels,
  type SocialBootstrap,
  type SocialPost,
  type SocialStatus,
} from "@/lib/social";
const selectionClass =
  "h-10 rounded-lg border bg-background px-3 text-sm max-w-full";
export default function Social() {
  const { user, signOut } = useAuth(),
    { isAdmin, isMaster, loading } = useProfile(),
    qc = useQueryClient();
  const [tab, setTab] = useState(() =>
      new URLSearchParams(window.location.search).get("aba") === "accounts"
        ? "accounts"
        : "calendar",
    ),
    [month, setMonth] = useState(() => new Date()),
    [clientId, setClientId] = useState(() =>
      typeof window === "undefined"
        ? "all"
        : new URLSearchParams(window.location.search).get("cliente") || "all",
    ),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [editor, setEditor] = useState<{
      clientId: string;
      post: SocialPost | null;
    } | null>(null),
    [choose, setChoose] = useState(false),
    [memberUser, setMemberUser] = useState(""),
    [memberClient, setMemberClient] = useState(""),
    [canApprove, setCanApprove] = useState(false),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["social-bootstrap", user?.id],
    enabled: !!user && !loading,
    queryFn: () => socialApi<SocialBootstrap>({ action: "bootstrap" }),
    staleTime: 30000,
    refetchOnMount: true,
  });
  const data = query.data;
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["social-bootstrap", user?.id] });
  const clients = data?.clients || [],
    allPosts = data?.posts || [];
  const posts = allPosts.filter(
    (p) =>
      (clientId === "all" || p.client_id === clientId) &&
      (status === "all" || p.status === status) &&
      [p.title, clients.find((c) => c.id === p.client_id)?.nome || ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const selectedClient = clients.find((c) => c.id === editor?.clientId);
  const today = editorialDate(new Date().toISOString());
  const stats = [
    {
      label: "Em produção",
      value: allPosts.filter((p) =>
        ["draft", "production", "changes"].includes(p.status),
      ).length,
      icon: LayoutGrid,
    },
    {
      label: "Aguardando revisão",
      value: allPosts.filter((p) => p.status === "review").length,
      icon: ClipboardCheck,
    },
    {
      label: "Aprovados",
      value: allPosts.filter((p) => p.status === "approved").length,
      icon: CheckCircle2,
    },
    {
      label: "Planejados para hoje",
      value: allPosts.filter(
        (p) =>
          editorialDate(p.scheduled_at) === today &&
          !["cancelled", "published_manual"].includes(p.status),
      ).length,
      icon: CalendarDays,
    },
  ];
  async function assign(
    remove = false,
    userId = memberUser,
    client = memberClient,
  ) {
    if (!client || !userId) return;
    setBusy(true);
    try {
      await socialApi({
        action: "member",
        clientId: client,
        userId,
        canApprove,
        remove,
      });
      toast.success(
        remove
          ? "Acesso editorial removido."
          : "Carteira editorial atualizada.",
      );
      refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível alterar o acesso.",
      );
    } finally {
      setBusy(false);
    }
  }
  function create() {
    if (clientId !== "all") {
      setEditor({ clientId, post: null });
    } else setChoose(true);
  }
  const open = (post: SocialPost) =>
    setEditor({ clientId: post.client_id, post });
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar
          isAdmin={isAdmin}
          isMaster={isMaster}
          onSignOut={signOut}
        />
        <main className="flex-1 min-w-0">
          <header className="flex items-center justify-between px-5 md:px-9 py-5 border-b border-border/60">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-[10px] uppercase tracking-[.2em] text-primary">
                Workspace / Central Social
              </span>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Carteiras separadas
            </span>
          </header>
          <div className="p-5 md:p-9 space-y-7 max-w-[1600px] mx-auto">
            <section className="relative overflow-hidden rounded-3xl border bg-card p-6 md:p-9">
              <div className="pointer-events-none absolute -right-12 -top-20 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[.25em] text-primary mb-3">
                    Newvox / Conteúdo com direção
                  </p>
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                    Da ideia à publicação.
                  </h1>
                  <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                    Um espaço para planejar, produzir e revisar o conteúdo de
                    cada cliente. Clareza para o time, consistência para as
                    marcas.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Atualizar Central Social"
                    disabled={query.isFetching}
                    onClick={refresh}
                  >
                    <RefreshCw
                      className={
                        "h-4 w-4 " + (query.isFetching ? "animate-spin" : "")
                      }
                    />
                  </Button>
                  <Button onClick={create} disabled={!clients.length}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo conteúdo
                  </Button>
                </div>
              </div>
            </section>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border bg-card p-5">
                  <div className="flex justify-between items-center">
                    <s.icon className="h-4 w-4 text-primary" />
                    <span className="text-3xl font-semibold tracking-tight">
                      {query.isPending ? "—" : s.value}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
            {query.isError ? (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
              >
                <p className="text-sm">
                  {query.error instanceof Error
                    ? query.error.message
                    : "Não foi possível carregar a Central Social."}
                </p>
                <Button className="mt-3" variant="outline" onClick={refresh}>
                  Tentar novamente
                </Button>
              </div>
            ) : null}
            {query.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                Carregando sua carteira editorial…
              </p>
            ) : null}
            <Tabs value={tab} onValueChange={setTab} className="space-y-6">
              <TabsList className="h-auto flex flex-wrap justify-start w-fit gap-1 p-1">
                <TabsTrigger value="calendar">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Calendário
                </TabsTrigger>
                <TabsTrigger value="production">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Produção
                </TabsTrigger>
                <TabsTrigger value="library">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Biblioteca
                </TabsTrigger>
                <TabsTrigger value="accounts">
                  <Instagram className="h-4 w-4 mr-2" />
                  Instagram
                </TabsTrigger>
                {isMaster ? (
                  <TabsTrigger value="team">
                    <Users className="h-4 w-4 mr-2" />
                    Equipe
                  </TabsTrigger>
                ) : null}
              </TabsList>
              {["calendar", "production", "library"].includes(tab) ? (
                <div className="flex flex-wrap gap-3">
                  <select
                    aria-label="Filtrar cliente"
                    className={selectionClass}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="all">Todos os meus clientes</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Buscar conteúdo"
                    className="max-w-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar conteúdo ou cliente…"
                  />
                  <select
                    aria-label="Filtrar etapa"
                    className={selectionClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">Todas as etapas</option>
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <TabsContent value="calendar" className="space-y-4">
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <h2 className="text-xl font-semibold capitalize">
                      {format(month, "MMMM yyyy", { locale: ptBR })}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Brasília · datas planejadas, sem publicação automática
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Mês anterior"
                      onClick={() => setMonth((m) => addMonths(m, -1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setMonth(new Date())}
                    >
                      Hoje
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Próximo mês"
                      onClick={() => setMonth((m) => addMonths(m, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <EditorialCalendar
                  month={month}
                  posts={posts}
                  onSelect={open}
                />
                {posts.some((p) => !p.scheduled_at) ? (
                  <section className="rounded-xl border p-4 space-y-2">
                    <h3 className="text-sm font-semibold">Ainda sem data</h3>
                    <div className="flex flex-wrap gap-2">
                      {posts
                        .filter((p) => !p.scheduled_at)
                        .map((p) => (
                          <Button
                            variant="outline"
                            size="sm"
                            key={p.id}
                            onClick={() => open(p)}
                          >
                            {p.title}
                          </Button>
                        ))}
                    </div>
                  </section>
                ) : null}
              </TabsContent>
              <TabsContent value="production">
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {(
                    [
                      "draft",
                      "production",
                      "review",
                      "changes",
                      "approved",
                      "published_manual",
                    ] as SocialStatus[]
                  ).map((stage) => (
                    <section
                      key={stage}
                      className="w-64 shrink-0 rounded-2xl bg-muted/30 border p-3"
                    >
                      <div className="flex justify-between items-center p-2 mb-3">
                        <h2 className="text-xs font-semibold">
                          {statusLabels[stage]}
                        </h2>
                        <span className="text-xs text-muted-foreground">
                          {posts.filter((p) => p.status === stage).length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {posts
                          .filter((p) => p.status === stage)
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => open(p)}
                              className="w-full text-left rounded-xl border bg-card p-4 hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <span className="text-[9px] uppercase tracking-wider text-primary">
                                {formatLabels[p.format]} · v{p.version}
                              </span>
                              <h3 className="text-sm font-semibold mt-2 mb-2">
                                {p.title}
                              </h3>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {
                                  clients.find((c) => c.id === p.client_id)
                                    ?.nome
                                }
                              </p>
                              <div className="border-t mt-3 pt-3 text-[10px] text-muted-foreground flex justify-between">
                                <span>
                                  {p.scheduled_at
                                    ? new Date(
                                        p.scheduled_at,
                                      ).toLocaleDateString("pt-BR", {
                                        timeZone: "America/Sao_Paulo",
                                      })
                                    : "Sem data"}
                                </span>
                                <span>{p.assets.length} arquivos</span>
                              </div>
                            </button>
                          ))}
                        {!posts.some((p) => p.status === stage) ? (
                          <p className="text-xs text-muted-foreground p-3">
                            Nenhum conteúdo nesta etapa.
                          </p>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
                {status === "cancelled" ? (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {posts.map((p) => (
                      <Button
                        variant="outline"
                        key={p.id}
                        onClick={() => open(p)}
                      >
                        {p.title} · Cancelado
                      </Button>
                    ))}
                  </div>
                ) : null}
              </TabsContent>
              <TabsContent value="library">
                <section className="rounded-2xl border bg-card p-6">
                  <h2 className="text-lg font-semibold">
                    Biblioteca editorial
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2 mb-6">
                    Arquivos das fichas salvas, separados por cliente. Abra o
                    conteúdo para visualizar os materiais e suas versões.
                  </p>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {posts.flatMap((p) =>
                      p.assets.map((a, i) => (
                        <button
                          key={p.id + a.path + i}
                          className="text-left rounded-xl border p-4 hover:border-primary/40"
                          onClick={() => open(p)}
                        >
                          <FolderOpen className="h-5 w-5 text-primary mb-3" />
                          <p className="text-sm font-medium truncate">
                            {a.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {clients.find((c) => c.id === p.client_id)?.nome}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-3">
                            {(a.size / 1024 / 1024).toFixed(1)} MB · {p.title}
                          </p>
                        </button>
                      )),
                    )}
                    {!posts.some((p) => p.assets.length) ? (
                      <p className="text-sm text-muted-foreground">
                        A biblioteca será preenchida ao salvar artes e vídeos
                        nas fichas.
                      </p>
                    ) : null}
                  </div>
                </section>
              </TabsContent>
              <TabsContent value="accounts">
                <InstagramAccounts clients={clients} />
              </TabsContent>
              {isMaster ? (
                <TabsContent value="team" className="space-y-5">
                  <section className="rounded-2xl border bg-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold">
                      Carteira da social media
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Atribua usuários já cadastrados. Este acesso vale somente
                      para a Central Social; não libera conversas, anúncios ou o
                      CRM.
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <label className="text-sm space-y-2">
                        Cliente
                        <select
                          className={selectionClass + " block w-full"}
                          value={memberClient}
                          onChange={(e) => setMemberClient(e.target.value)}
                        >
                          <option value="">Selecionar cliente</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm space-y-2">
                        Pessoa da equipe
                        <select
                          className={selectionClass + " block w-full"}
                          value={memberUser}
                          onChange={(e) => setMemberUser(e.target.value)}
                        >
                          <option value="">Selecionar pessoa</option>
                          {data?.profiles.map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={canApprove}
                        onChange={(e) => setCanApprove(e.target.checked)}
                      />
                      Permitir também aprovação interna e registro de publicação
                      manual
                    </label>
                    <Button
                      disabled={busy || !memberClient || !memberUser}
                      onClick={() => void assign()}
                    >
                      Salvar acesso editorial
                    </Button>
                  </section>
                  <div className="rounded-2xl border divide-y">
                    {data?.members.map((m) => (
                      <div
                        key={m.client_id + m.user_id}
                        className="p-4 flex justify-between items-center gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {clients.find((c) => c.id === m.client_id)?.nome}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {data.profiles.find((p) => p.user_id === m.user_id)
                              ?.full_name || "Usuário"}{" "}
                            ·{" "}
                            {m.can_approve
                              ? "Produção e aprovação"
                              : "Somente produção"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Remover o acesso editorial deste usuário a este cliente?",
                              )
                            )
                              void assign(true, m.user_id, m.client_id);
                          }}
                        >
                          Remover acesso
                        </Button>
                      </div>
                    ))}
                    {data?.members.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-5">
                        Nenhuma atribuição adicional. Os gestores já têm acesso
                        editorial aos próprios clientes.
                      </p>
                    ) : null}
                  </div>
                </TabsContent>
              ) : null}
            </Tabs>
            {data && !clients.length ? (
              <div className="rounded-2xl border p-6 text-sm text-muted-foreground">
                Sua carteira editorial ainda está vazia. Peça ao Master para
                atribuir os clientes na aba Equipe.
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {allPosts.length >= 500
                ? "Exibindo os 500 conteúdos mais recentes. "
                : ""}
              Publicações automáticas e aprovação externa por link serão
              habilitadas em uma próxima etapa.
            </p>
          </div>
        </main>
      </div>
      <Dialog open={choose} onOpenChange={setChoose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Para qual cliente vamos criar?</DialogTitle>
            <DialogDescription>
              O conteúdo e os arquivos ficam vinculados exclusivamente a este
              cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto space-y-2">
            {clients.map((c) => (
              <Button
                className="w-full justify-start h-auto py-3 whitespace-normal text-left"
                variant="outline"
                key={c.id}
                onClick={() => {
                  setChoose(false);
                  setEditor({ clientId: c.id, post: null });
                }}
              >
                {c.nome}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {editor && selectedClient && user ? (
        <SocialEditor
          key={editor.post?.id || "new-" + editor.clientId}
          initial={editor.post}
          client={selectedClient}
          userId={user.id}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      ) : null}
    </SidebarProvider>
  );
}
