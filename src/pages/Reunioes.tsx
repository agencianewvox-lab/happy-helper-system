import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  Download,
  ShieldCheck,
  Monitor,
  RefreshCw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MeetingHistory } from "@/components/meetings/MeetingHistory";
import {
  auditLabels,
  downloadMeetingExtension,
  meetingDate,
  meetingsApi,
  type MeetingBootstrap,
  type MeetingDevice,
} from "@/lib/meetings";
export default function Reunioes() {
  const { user, signOut } = useAuth(),
    { isAdmin, isMaster, profile } = useProfile(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [client, setClient] = useState("");
  const allowed = isMaster || isAdmin || profile?.role === "gestor";
  const query = useQuery({
    queryKey: ["meetings", user?.id],
    enabled: !!user && allowed,
    queryFn: () => meetingsApi<MeetingBootstrap>("bootstrap"),
    staleTime: 15000,
    refetchOnMount: true,
    refetchInterval: 30000,
  });
  async function download() {
    setBusy(true);
    try {
      await downloadMeetingExtension();
      toast.success("Extraia o ZIP antes de carregar a pasta no Chrome.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateDevice(device: MeetingDevice, status: string) {
    if (
      status === "revoked" &&
      !window.confirm(
        `Bloquear “${device.label}”? As sessões serão revogadas. A captura conectada será interrompida na próxima verificação (até 45 segundos).`,
      )
    )
      return;
    setBusy(true);
    try {
      await meetingsApi("device_update", { deviceId: device.id, status });
      await qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success(
        status === "approved"
          ? "Dispositivo liberado. Se estava bloqueado, o usuário deverá autenticar novamente."
          : "Dispositivo bloqueado.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const data = query.data;
  return (
    <SidebarProvider>
      <DashboardSidebar
        isAdmin={isAdmin}
        isMaster={isMaster}
        onSignOut={() => void signOut()}
      />
      <main className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b px-6 py-4">
          <SidebarTrigger />
          <span className="text-xs tracking-widest text-muted-foreground">
            NEWVOX / REUNIÕES
          </span>
        </header>
        <div className="mx-auto max-w-6xl space-y-7 p-5 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[.2em] text-primary">
                Cada conversa, um próximo passo
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Reuniões que viram contexto.
              </h1>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                Do Google Meet ao histórico certo. Registre, revise os
                alinhamentos e acompanhe as ações da sua carteira.
              </p>
            </div>
            <Button disabled={busy || !allowed} onClick={() => void download()}>
              <Download size={16} />
              {busy ? "Aguarde…" : "Baixar extensão · v1.1"}
            </Button>
          </div>
          {!allowed ? (
            <p role="alert">Área exclusiva do Master e dos gestores.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    icon: Mic,
                    label: "Reuniões registradas",
                    value: data?.meetings.length || 0,
                  },
                  {
                    icon: Clock,
                    label: "Aguardando revisão",
                    value:
                      data?.meetings.filter(
                        (m) => m.status === "ready" && !m.reviewed_at,
                      ).length || 0,
                  },
                  {
                    icon: ShieldCheck,
                    label: "Dispositivos aguardando aprovação",
                    value:
                      data?.devices.filter((d) => d.status === "pending")
                        .length || 0,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border bg-card p-5"
                  >
                    <item.icon className="mb-4 h-5 w-5 text-primary" />
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
              <details className="rounded-2xl border bg-primary/5 p-5">
                <summary className="cursor-pointer font-semibold">
                  Primeiro acesso · instalar sem Web Store
                </summary>
                <ol className="ml-5 mt-4 list-decimal space-y-2 text-sm text-muted-foreground">
                  <li>
                    Baixe a extensão acima e extraia o ZIP em uma pasta fixa do
                    computador.
                  </li>
                  <li>
                    Abra <code>chrome://extensions</code>, ative “Modo do
                    desenvolvedor” e clique em “Carregar sem compactação”.
                  </li>
                  <li>
                    Selecione a pasta <strong>newvox-reunioes</strong>, que
                    contém o arquivo manifest.json, e fixe o ícone na barra do
                    Chrome.
                  </li>
                  <li>
                    Recarregue a aba do Meet e clique na extensão: ela abre ao
                    lado da reunião, no painel lateral do Chrome. Dê um nome ao
                    computador e autentique pelo painel.
                  </li>
                  <li>
                    O Master aprova o primeiro acesso do gestor na aba
                    Dispositivos. Selecione o cliente e confirme o aviso aos
                    participantes.
                  </li>
                  <li>
                    Acompanhe as falas com as legendas CC ativadas em Português
                    (Brasil). Os nomes são os exibidos pelo Meet; sem
                    adivinhação por voz.
                  </li>
                </ol>
                <p className="mt-4 text-xs text-muted-foreground">
                  Atualizações são manuais: substitua os arquivos pela nova
                  versão e clique em Recarregar na tela de extensões, fora de
                  uma reunião. Recarregue também o Meet. Mantenha a mesma pasta
                  para preservar a instalação. Não compartilhe a pasta com
                  terceiros. O código da extensão não contém chaves e não
                  concede acesso sem autenticação.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Áudio temporário: removido 24h após transcrição confirmada;
                  trechos com falha expiram em 7 dias. Transcrição, revisão e
                  histórico permanecem no cliente. A sessão dura até 8h e não
                  sobrevive ao fechamento do Chrome.
                </p>
              </details>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw
                    className={query.isFetching ? "animate-spin" : ""}
                    size={14}
                  />
                  Atualizar
                </Button>
              </div>
              {query.isError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/40 p-4"
                >
                  {query.error.message}
                </p>
              ) : query.isLoading ? (
                <p role="status">Carregando sua carteira…</p>
              ) : data ? (
                <Tabs defaultValue="history">
                  <TabsList>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                    <TabsTrigger value="devices">Dispositivos</TabsTrigger>
                    <TabsTrigger value="audit">Registro de uso</TabsTrigger>
                  </TabsList>
                  <TabsContent value="history" className="space-y-5 pt-3">
                    <label className="block text-sm">
                      Filtrar cliente
                      <select
                        className="ml-3 max-w-full rounded-lg border bg-background p-2"
                        value={client}
                        onChange={(e) => setClient(e.target.value)}
                      >
                        <option value="">Toda a carteira</option>
                        {data.clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <MeetingHistory
                      clientId={client || undefined}
                      meetings={data.meetings.filter(
                        (m) => !client || m.client_id === client,
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      Até 100 reuniões recentes. O histórico de cada cliente
                      também está disponível no card.
                    </p>
                  </TabsContent>
                  <TabsContent value="devices" className="space-y-4 pt-3">
                    <p className="text-sm text-muted-foreground">
                      {data.actor.isMaster
                        ? "Aprove computadores conhecidos e revogue os que não devem mais acessar. Nome e versão são informados pelo dispositivo, não comprovam integridade do computador."
                        : "Seus computadores. A aprovação e o bloqueio são controlados pelo Master."}
                    </p>
                    {!data.devices.length ? (
                      <p className="rounded-xl border border-dashed p-7">
                        Nenhum dispositivo vinculado. Instale a extensão e
                        autentique pelo painel.
                      </p>
                    ) : (
                      data.devices.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5"
                        >
                          <div className="flex gap-4">
                            <Monitor className="text-primary" />
                            <div>
                              <h3 className="font-semibold">{d.label}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {d.user_name} · v{d.extension_version} ·{" "}
                                {d.status === "approved"
                                  ? "Liberado"
                                  : d.status === "pending"
                                    ? "Aguardando aprovação"
                                    : "Bloqueado"}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Última comunicação:{" "}
                                {meetingDate(d.last_seen_at)}
                              </p>
                            </div>
                          </div>
                          {data.actor.isMaster && (
                            <div className="flex gap-2">
                              {d.status === "pending" && (
                                <Button
                                  disabled={busy}
                                  variant="outline"
                                  onClick={() =>
                                    void updateDevice(d, "revoked")
                                  }
                                >
                                  Bloquear
                                </Button>
                              )}
                              <Button
                                disabled={busy}
                                variant={
                                  d.status === "approved"
                                    ? "outline"
                                    : "default"
                                }
                                onClick={() =>
                                  void updateDevice(
                                    d,
                                    d.status === "approved"
                                      ? "revoked"
                                      : "approved",
                                  )
                                }
                              >
                                {d.status === "approved"
                                  ? "Bloquear dispositivo"
                                  : "Aprovar dispositivo"}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </TabsContent>
                  <TabsContent value="audit" className="pt-3">
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-4">Quando</th>
                            <th className="p-4">Quem</th>
                            <th className="p-4">Atividade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.audit.map((a) => (
                            <tr className="border-t" key={a.id}>
                              <td className="whitespace-nowrap p-4 text-xs">
                                {meetingDate(a.created_at)}
                              </td>
                              <td className="p-4">
                                {a.actor_name || "Sistema"}
                              </td>
                              <td className="p-4">
                                {auditLabels[a.action] || a.action}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.audit.length && (
                        <p className="p-6 text-sm text-muted-foreground">
                          Nenhum uso registrado ainda.
                        </p>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Últimos 100 eventos. Nenhuma senha, chave, áudio ou
                      transcrição é incluída neste registro de uso.
                    </p>
                  </TabsContent>
                </Tabs>
              ) : null}
            </>
          )}
        </div>
      </main>
    </SidebarProvider>
  );
}
