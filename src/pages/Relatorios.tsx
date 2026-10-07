import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Smartphone,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
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
} from "@/lib/reports";
export default function Relatorios() {
  const { user, signOut } = useAuth(),
    { isAdmin, isMaster, loading } = useProfile(),
    qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("clients");
  const [connection, setConnection] = useState<{
      status: string;
      qr?: string;
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
        ["queued", "processing"].includes(r.status),
      )
        ? 15000
        : false,
  });
  const data = query.data;
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  useEffect(() => {
    if (connection?.status !== "connecting") return;
    let alive = true;
    const timer = setInterval(() => {
      reportsApi<{ status: string }>({ action: "connection-status" })
        .then((state) => {
          if (alive && state.status === "open") {
            setConnection(state);
            toast.success("Seu WhatsApp está conectado.");
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
  }, [connection?.status, user?.id, qc]);
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
  const active = data?.configs.filter((c) => c.enabled).length || 0;
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
                    return (
                      <article
                        key={c.id}
                        className="border rounded-2xl bg-card p-5 flex flex-col gap-5"
                      >
                        <div className="flex justify-between gap-3">
                          <h2 className="font-semibold leading-tight">
                            {c.nome}
                          </h2>
                          <span
                            className={
                              "text-[10px] shrink-0 h-fit px-2 py-1 rounded-full " +
                              (config?.enabled
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground")
                            }
                          >
                            {config?.enabled ? "Automático" : "Pausado"}
                          </span>
                        </div>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>
                            Gestor: {c.gestor_responsavel || "Não atribuído"}
                          </p>
                          <p>
                            CRM:{" "}
                            {bound
                              ? "Vínculo confirmado"
                              : "Aguardando vínculo do Master"}
                          </p>
                          <p>
                            Meta:{" "}
                            {c.ad_account_id
                              ? "Conta vinculada"
                              : "Sem conta vinculada"}
                          </p>
                          <p>
                            Agenda:{" "}
                            {config
                              ? config.settings.time +
                                " · " +
                                {
                                  daily: "Diária",
                                  weekly: "Semanal",
                                  monthly: "Mensal",
                                }[config.settings.frequency]
                              : "Ainda não configurada"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="mt-auto justify-between"
                          onClick={() => setSelected(c.id)}
                        >
                          Configurar relatório
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                        {config?.enabled && (
                          <Button
                            variant="ghost"
                            size="sm"
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
                                toast.error(
                                  e instanceof Error
                                    ? e.message
                                    : "Não foi possível pausar.",
                                );
                              } finally {
                                setPausing(null);
                              }
                            }}
                          >
                            Pausar agenda
                          </Button>
                        )}
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
                          : "Desconectado"}
                    </strong>
                  </p>
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
                <div className="rounded-2xl border overflow-hidden">
                  <div className="px-5 py-4 bg-muted/30">
                    <h2 className="font-medium">Últimas execuções</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      “Aceito pela Evolution” não significa leitura ou entrega
                      confirmada. Envio incerto exige conferir o grupo antes de
                      repetir.
                    </p>
                  </div>
                  {data?.runs.map((run) => (
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
                          (["failed", "uncertain"].includes(run.status)
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
              {viewRun ? runLabels[viewRun.status] : "Relatório"}
            </DialogTitle>
            <DialogDescription>
              Conteúdo registrado para esta execução, sem alterar a configuração
              atual.
            </DialogDescription>
          </DialogHeader>
          {viewRun?.error && (
            <p className="text-sm text-destructive">{viewRun.error}</p>
          )}
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {viewRun?.message || "O relatório ainda não foi preparado."}
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
