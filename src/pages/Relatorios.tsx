import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Smartphone,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  Send,
  Eye,
  History,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ReportEditor } from "@/components/reports/ReportEditor";
import {
  ReportBootstrap,
  ReportRun,
  reportsApi,
  runLabels,
  reportPeriod,
} from "@/lib/reports";
export default function Relatorios() {
  const { user, signOut } = useAuth(),
    { isAdmin, isMaster, loading } = useProfile(),
    qc = useQueryClient();
  const [editorTab, setEditorTab] = useState("sources");
  const [historyClient, setHistoryClient] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("clients");
  const [connection, setConnection] = useState<{
      status: string;
      qr?: string;
      phone?: string;
      checkedAt?: string;
      error?: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const [viewRun, setViewRun] = useState<ReportRun | null>(null),
    [disconnect, setDisconnect] = useState(false);
  const [pausing, setPausing] = useState<string | null>(null);
  const key = ["report-bootstrap", user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && !loading,
    queryFn: () => reportsApi<ReportBootstrap>({ action: "bootstrap" }),
    staleTime: 30000,
    refetchOnMount: true,
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) =>
        ["queued", "processing", "sending"].includes(r.status),
      )
        ? 15000
        : false,
  });
  const data = query.data;
  const displayedRun = data?.runs.find(r=>r.id===viewRun?.id) || viewRun;
  const refresh = useCallback(
    () =>
      void qc.invalidateQueries({ queryKey: ["report-bootstrap", user?.id] }),
    [qc, user?.id],
  );
  useEffect(() => {
    if (tab !== "connection" && connection?.status !== "connecting") return;
    let alive = true;
    const timer = setInterval(() => {
      reportsApi<{ status: string }>({ action: "connection-status" })
        .then((state) => {
          if (alive) {
            if (state.status === "open" && connection?.status === "connecting")
              toast.success("Seu WhatsApp está conectado.");
            setConnection(state);
            refresh();
          }
        })
        .catch(() => {
          /* keep QR until user refreshes */
        });
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [connection?.status, refresh, tab]);
  async function connect(action: string) {
    setBusy(true);
    try {
      const state = await reportsApi<{ status: string; qr?: string }>({
        action,
      });
      setConnection(state);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conexão indisponível.");
    } finally {
      setBusy(false);
    }
  }
  const clients =
    data?.clients.filter((c) =>
      c.nome.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) || [];
  const client = data?.clients.find((c) => c.id === selected),
    source = data?.sources.find((s) => s.client_id === selected);
  const status =
    connection?.status || data?.connection?.status || "disconnected";
  const active =
    data?.configs.filter((c) => c.enabled && !c.review_required).length || 0;
  const connectionInfo =
    connection ||
    (data?.connection
      ? {
          phone: data.connection.phone,
          checkedAt: data.connection.last_checked_at,
          error: data.connection.last_error,
        }
      : null);
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar
          isAdmin={isAdmin}
          isMaster={isMaster}
          onSignOut={signOut}
        />
        <main className="flex-1 min-w-0">
          <header className="flex justify-between items-center px-5 md:px-9 py-5 border-b border-border/60">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-[10px] uppercase tracking-[.2em] text-primary">
                Workspace / Relatórios
              </span>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Carteira protegida
            </span>
          </header>
          <div className="p-5 md:p-9 space-y-7 max-w-[1600px] mx-auto">
            <div className="flex justify-between gap-4 items-start">
              <div>
                <p className="text-xs uppercase tracking-[.18em] text-primary mb-3">
                  INTELIGÊNCIA QUE CHEGA AO CLIENTE
                </p>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                  Central de relatórios
                </h1>
                <p className="text-muted-foreground mt-3 max-w-2xl">
                  Resultados reais do comercial, mídia e rotina de envio. Cada
                  cliente com suas fontes, seu funil e sua mensagem.
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Atualizar central"
                disabled={query.isFetching}
                onClick={refresh}
              >
                <RefreshCw
                  className={
                    query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
                  }
                />
              </Button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  icon: ClipboardCheck,
                  label: "Clientes na sua carteira",
                  value: data?.clients.length ?? "—",
                },
                { icon: Clock, label: "Agendas ativas", value: active },
                {
                  icon: Smartphone,
                  label: "Seu WhatsApp de envio",
                  value: status === "open" ? "Conectado" : "Não conectado",
                },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border bg-card p-5">
                  <c.icon className="h-5 w-5 text-primary mb-5" />
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-2xl font-semibold mt-2">{c.value}</p>
                </div>
              ))}
            </div>
            {query.isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                Carregando sua central…
              </p>
            )}
            {query.error && (
              <div
                role="alert"
                className="border border-destructive/30 bg-destructive/5 rounded-xl p-4 text-sm"
              >
                {query.error.message}
                <Button variant="link" onClick={refresh}>
                  Tentar novamente
                </Button>
              </div>
            )}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-5">
                <TabsTrigger value="clients">Meus clientes</TabsTrigger>
                <TabsTrigger value="connection">Meu WhatsApp</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="clients" className="space-y-4">
                <Input
                  aria-label="Buscar cliente"
                  placeholder="Buscar cliente da carteira…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-md"
                />
                <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {clients.map((c) => {
                    const config = data?.configs.find(
                        (x) => x.client_id === c.id,
                      ),
                      bound = data?.sources.some((x) => x.client_id === c.id);
                    const last = data?.runs.find((r) => r.client_id === c.id);
                    const attention =
                      config?.review_required ||
                      ["failed", "uncertain", "expired"].includes(
                        last?.status || "",
                      );
                    const state = !config
                      ? "Não configurado"
                      : attention
                        ? "Atenção"
                        : config.enabled
                          ? "Agendado"
                          : config.preview_hash
                            ? "Pronto"
                            : config.version > 1
                              ? "Pausado"
                              : "Rascunho";
                    const sender =
                      data?.profiles.find(
                        (p) => p.user_id === config?.owner_user_id,
                      )?.full_name ||
                      (config?.owner_user_id === user?.id
                        ? "Meu WhatsApp"
                        : "Não definido");
                    let period = "Escolha um período";
                    try {
                      if (config) {
                        const p = reportPeriod(config.settings);
                        period =
                          p.startDate.split("-").reverse().join("/") +
                          " → " +
                          p.endDate.split("-").reverse().join("/");
                      }
                    } catch {
                      /* draft */
                    }
                    const openEditor = (step: string) => {
                      setEditorTab(step);
                      setSelected(c.id);
                    };
                    return (
                      <article
                        key={c.id}
                        className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg hover:shadow-primary/5"
                      >
                        <div
                          className={
                            "h-1 w-full " +
                            (attention
                              ? "bg-amber-400"
                              : config?.enabled
                                ? "bg-primary"
                                : "bg-primary/20")
                          }
                        />
                        <div className="flex flex-1 flex-col gap-5 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="text-base font-semibold leading-snug">
                              {c.nome}
                            </h2>
                            <span
                              className={
                                "shrink-0 rounded-full px-2 py-1 text-[10px] " +
                                (attention
                                  ? "bg-amber-500/10 text-amber-500"
                                  : config?.enabled
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground")
                              }
                            >
                              {state}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[10px] font-medium">
                            <span className="rounded-md border px-2 py-1">
                              Meta {c.ad_account_id ? "vinculada" : "pendente"}
                            </span>
                            <span className="rounded-md border px-2 py-1">
                              {config?.settings.dataMode === "meta"
                                ? "Somente Meta"
                                : bound
                                  ? "Voxi + Meta"
                                  : "Sem vínculo Voxi"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="text-muted-foreground">Gestor</p>
                              <p className="mt-1 font-medium">
                                {c.gestor_responsavel || "Não atribuído"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Remetente</p>
                              <p className="mt-1 font-medium">{sender}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-muted-foreground">
                                Período atual
                              </p>
                              <p className="mt-1">{period}</p>
                            </div>
                          </div>
                          <div className="rounded-xl bg-background/60 p-3 text-xs">
                            <p className="flex items-center gap-2 font-medium">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              Próximo envio
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {config?.nextExecutions?.[0]
                                ? new Date(
                                    config.nextExecutions[0],
                                  ).toLocaleString("pt-BR", {
                                    timeZone: config.settings.timezone,
                                  }) +
                                  " · " +
                                  config.settings.timezone
                                : config?.review_required
                                  ? "Aguardando nova revisão"
                                  : config?.enabled
                                    ? "Sem ocorrência futura"
                                    : "Agenda não ativa"}
                            </p>
                            <p className="mt-3 border-t pt-2 text-muted-foreground">
                              Último resultado:{" "}
                              {last
                                ? runLabels[last.status]
                                : "Nenhuma execução"}
                            </p>
                          </div>
                          <div className="mt-auto grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              onClick={() => openEditor("sources")}
                            >
                              Configurar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => openEditor("preview")}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Visualizar
                            </Button>
                            <Button
                              className="col-span-2"
                              onClick={() => openEditor("preview")}
                              disabled={!config}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Enviar agora
                            </Button>
                          </div>
                          <div className="flex items-center justify-between border-t pt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setHistoryClient(c.id);
                                setTab("history");
                              }}
                            >
                              <History className="mr-1 h-3.5 w-3.5" />
                              Histórico
                            </Button>
                            {config?.enabled && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pausing === c.id}
                                onClick={async () => {
                                  setPausing(c.id);
                                  try {
                                    await reportsApi({
                                      action: "pause",
                                      clientId: c.id,
                                    });
                                    toast.success("Agenda pausada.");
                                    refresh();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  } finally {
                                    setPausing(null);
                                  }
                                }}
                              >
                                {pausing === c.id ? "Pausando…" : "Pausar"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {data && !clients.length && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum cliente encontrado na sua carteira.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="connection">
                <div className="rounded-2xl border bg-card p-6 md:p-8 max-w-3xl space-y-5">
                  <Smartphone className="text-primary h-8 w-8" />
                  <h2 className="text-2xl font-semibold">
                    Seu número, seus relatórios
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Esta conexão é exclusiva para seus envios. Não substitui nem
                    altera o WhatsApp central que recebe as conversas dos
                    grupos. Seu número precisa estar nos grupos dos clientes que
                    você gerencia.
                  </p>
                  <p className="text-sm">
                    Estado:{" "}
                    <strong>
                      {status === "open"
                        ? "Conectado"
                        : status === "connecting"
                          ? "Aguardando leitura do QR"
                          : status === "unknown"
                            ? "Evolution indisponível · estado não confirmado"
                            : "Desconectado"}
                    </strong>
                  </p>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p>Número: {connectionInfo?.phone || "Não confirmado"}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Última verificação:{" "}
                      {connectionInfo?.checkedAt
                        ? new Date(connectionInfo.checkedAt).toLocaleString(
                            "pt-BR",
                          )
                        : "Ainda não consultado"}
                    </p>
                    {connectionInfo?.error && (
                      <p role="alert" className="mt-2 text-amber-500">
                        {connectionInfo.error}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={busy}
                      onClick={() => connect("connection-connect")}
                    >
                      {busy
                        ? "Aguarde…"
                        : status === "open"
                          ? "Verificar conexão"
                          : "Conectar / renovar QR"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => connect("connection-status")}
                    >
                      Atualizar estado
                    </Button>
                    {status === "open" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setDisconnect(true)}
                      >
                        Desconectar meu número
                      </Button>
                    )}
                  </div>
                  {connection?.qr && status !== "open" && (
                    <div className="space-y-3">
                      <img
                        src={connection.qr}
                        alt="QR para conectar seu WhatsApp de relatórios"
                        className="w-64 h-64 bg-white p-3 rounded-xl"
                      />
                      <p className="text-sm text-muted-foreground">
                        WhatsApp → Aparelhos conectados → Conectar aparelho. Se
                        o QR expirar, gere outro.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Antes de cada envio, o Painel verifica a conexão, sua
                    carteira e o grupo de destino.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="history">
                {historyClient && (
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm">
                      Histórico:{" "}
                      {data?.clients.find((c) => c.id === historyClient)?.nome}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryClient(null)}
                    >
                      Mostrar todos
                    </Button>
                  </div>
                )}
                <div className="rounded-2xl border overflow-hidden">
                  <div className="px-5 py-4 bg-muted/30">
                    <h2 className="font-medium">Últimas execuções</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      “Aceito pela Evolution” não significa leitura ou entrega
                      confirmada. Envio incerto exige conferir o grupo antes de
                      repetir.
                    </p>
                  </div>
                  {data?.runs
                    .filter(
                      (run) =>
                        !historyClient || run.client_id === historyClient,
                    )
                    .map((run) => (
                      <button
                        key={run.id}
                        onClick={() => setViewRun(run)}
                        className="w-full text-left p-5 border-t flex flex-wrap justify-between gap-3 hover:bg-muted/30"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {data.clients.find((c) => c.id === run.client_id)
                              ?.nome || "Cliente"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(run.created_at).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <span
                          className={
                            "text-xs " +
                            (["failed", "uncertain", "expired"].includes(
                              run.status,
                            )
                              ? "text-destructive"
                              : "text-muted-foreground")
                          }
                        >
                          {runLabels[run.status] || run.status}
                        </span>
                      </button>
                    ))}
                  {!data?.runs.length && (
                    <p className="p-5 text-sm text-muted-foreground">
                      Nenhum envio realizado. Comece pela configuração e pela
                      prévia de um cliente.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
      {client && user && (
        <ReportEditor
          key={client.id + ":" + (source?.version || 0)}
          client={client}
          initialTab={editorTab}
          source={source}
          config={data?.configs.find((c) => c.client_id === client.id)}
          master={isMaster || isAdmin}
          userId={user.id}
          profiles={data?.profiles || []}
          onClose={() => setSelected(null)}
          onSaved={refresh}
        />
      )}
      <Dialog
        open={!!viewRun}
        onOpenChange={(open) => {
          if (!open) setViewRun(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {displayedRun ? runLabels[displayedRun.status] : "Relatório"}
            </DialogTitle>
            <DialogDescription>
              Conteúdo registrado para esta execução, sem alterar a configuração
              atual.
            </DialogDescription>
          </DialogHeader>
          {displayedRun?.error && (
            <p className="text-sm text-destructive">{displayedRun.error}</p>
          )}
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {displayedRun?.message || "O relatório ainda não foi preparado."}
          </pre>
        </DialogContent>
      </Dialog>
      <Dialog open={disconnect} onOpenChange={setDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar seu WhatsApp?</DialogTitle>
            <DialogDescription>
              Suas agendas de envio serão pausadas. O WhatsApp central não será
              alterado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDisconnect(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                await connect("connection-disconnect");
                setDisconnect(false);
              }}
            >
              Desconectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
