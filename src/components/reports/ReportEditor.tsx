import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultSettings,
  metricLabels,
  reportsApi,
  ReportSettings,
  Metric,
  ReportClient,
  ReportConfig,
  ReportSource,
} from "@/lib/reports";
type Props = {
  client: ReportClient;
  config?: ReportConfig;
  source?: ReportSource;
  master: boolean;
  userId: string;
  profiles: { user_id: string; full_name: string }[];
  onClose: () => void;
  onSaved: () => void;
};
type Catalog = {
  pipelines: { id: string; name: string; account_root_id: string }[];
  stages: { id: string; name: string; pipeline_id: string }[];
};
const periods = {
  yesterday: "Ontem",
  last7: "Últimos 7 dias completos",
  last30: "Últimos 30 dias completos",
  previousMonth: "Mês anterior",
};
const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fieldClass =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";
export function ReportEditor({
  client,
  config,
  source,
  master,
  userId,
  profiles,
  onClose,
  onSaved,
}: Props) {
  const [settings, setSettings] = useState<ReportSettings>(() =>
    structuredClone(config?.settings || defaultSettings),
  );
  const [enabled, setEnabled] = useState(config?.enabled || false),
    [owner, setOwner] = useState(config?.owner_user_id || userId);
  const [version, setVersion] = useState(config?.version || 0),
    [tab, setTab] = useState(source ? "metrics" : "sources");
  const [account, setAccount] = useState(source?.crm_account_id || ""),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      message: string;
      previewToken: string;
      previewData: unknown;
    } | null>(null);
  const [sendConfirm, setSendConfirm] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const catalogue = useQuery({
    queryKey: ["report-source-catalog", userId],
    enabled: master && tab === "sources",
    queryFn: () =>
      reportsApi<{
        accounts: { id: string; name: string }[];
        pipelines: Catalog["pipelines"];
      }>({ action: "catalog" }),
    staleTime: 60000,
  });
  const funnels = useQuery({
    queryKey: ["report-client-catalog", userId, client.id, source?.version],
    enabled: !!source,
    queryFn: () =>
      reportsApi<Catalog>({ action: "client-catalog", clientId: client.id }),
    staleTime: 60000,
  });
  const update = (values: Partial<ReportSettings>) => {
    setSettings((s) => ({ ...s, ...values }));
    setPreview(null);
  };
  const toggleMetric = (m: Metric) =>
    update({
      metrics: settings.metrics.includes(m)
        ? settings.metrics.filter((x) => x !== m)
        : [...settings.metrics, m],
    });
  const toggleStage = (kind: "scheduled" | "attended", id: string) =>
    update({
      stages: {
        ...settings.stages,
        [kind]: settings.stages[kind].includes(id)
          ? settings.stages[kind].filter((x) => x !== id)
          : [...settings.stages[kind], id],
      },
    });
  async function execute(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operação indisponível.");
    } finally {
      setBusy(false);
    }
  }
  const payload = {
    clientId: client.id,
    settings,
    ownerUserId: owner,
    version,
    previewToken: preview?.previewToken,
    previewData: preview?.previewData,
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90dvh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <p className="text-[10px] uppercase tracking-[.22em] text-primary">
            NEWVOX / RELATÓRIOS
          </p>
          <DialogTitle className="text-2xl pr-6">{client.nome}</DialogTitle>
          <DialogDescription>
            Fontes verificadas, métricas comerciais reais e envio no grupo
            certo.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="px-6">
          <TabsList className="w-full justify-start overflow-x-auto my-4">
            <TabsTrigger value="sources">1. Fontes</TabsTrigger>
            <TabsTrigger value="metrics">2. Métricas e funil</TabsTrigger>
            <TabsTrigger value="message">3. Mensagem</TabsTrigger>
            <TabsTrigger value="schedule">4. Agenda</TabsTrigger>
            <TabsTrigger value="preview">5. Prévia</TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="space-y-5 pb-5">
            <div className="rounded-2xl border p-4 bg-muted/30">
              <p className="font-medium">
                Cada fonte pertence a um único cliente
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Voxi: leitura somente. Meta: investimento e mídia. WhatsApp:
                grupo já vinculado ao card. Nenhuma conta é associada pelo nome
                automaticamente.
              </p>
            </div>
            <p className="text-sm">
              Conta Meta do card:{" "}
              <strong>
                {client.ad_account_id ||
                  "Ainda não vinculada — configure na área Anúncios"}
              </strong>
            </p>
            <p className="text-sm text-muted-foreground break-all">
              Destino:{" "}
              {client.group_id.endsWith("@g.us")
                ? client.group_id
                : "Grupo ainda não vinculado ao WhatsApp"}
            </p>
            {master ? (
              <>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">
                    Conta principal no Voxi
                  </span>
                  <select
                    className={fieldClass}
                    value={account}
                    onChange={(e) => {
                      setAccount(e.target.value);
                      setConfirmed(false);
                    }}
                    disabled={busy || catalogue.isPending}
                  >
                    <option value="">Selecione a empresa no CRM</option>
                    {catalogue.data?.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                {catalogue.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {catalogue.error.message}
                  </p>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    Conferi que esta conta CRM e a conta Meta acima pertencem a{" "}
                    {client.nome}.
                  </span>
                </label>
                <Button
                  disabled={!account || !confirmed || busy}
                  onClick={() =>
                    execute(async () => {
                      await reportsApi({
                        action: "bind-source",
                        clientId: client.id,
                        accountId: account,
                        confirm: true,
                      });
                      toast.success(
                        "Vínculo confirmado. Reabra para configurar o relatório.",
                      );
                      onSaved();
                      onClose();
                    })
                  }
                >
                  Confirmar vínculo seguro
                </Button>
              </>
            ) : (
              <p className="text-sm">
                {source
                  ? "Conta CRM vinculada pelo Master."
                  : "Solicite ao Master o vínculo da conta CRM para liberar a configuração."}
              </p>
            )}
          </TabsContent>
          <TabsContent value="metrics" className="space-y-6 pb-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Período do relatório</span>
              <select
                className={fieldClass}
                value={settings.period}
                onChange={(e) =>
                  update({ period: e.target.value as ReportSettings["period"] })
                }
              >
                {Object.entries(periods).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              {Object.entries(metricLabels).map(([m, label]) => (
                <label
                  className="flex items-center gap-3 border rounded-xl p-3 text-sm"
                  key={m}
                >
                  <input
                    type="checkbox"
                    checked={settings.metrics.includes(m as Metric)}
                    onChange={() => toggleMetric(m as Metric)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <h3 className="font-medium mb-2">Funis incluídos</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Sem seleção: todos os funis autorizados e registros legados.
                Contas de funil exclusivo exigem sua seleção.
              </p>
              {funnels.isPending && source ? (
                <p role="status">Buscando funis…</p>
              ) : null}
              {funnels.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {funnels.error.message}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {funnels.data?.pipelines.map((p) => (
                  <label
                    className="border rounded-xl p-3 text-sm flex gap-2"
                    key={p.id}
                  >
                    <input
                      type="checkbox"
                      checked={settings.pipelines.includes(p.id)}
                      onChange={() =>
                        update({
                          pipelines: settings.pipelines.includes(p.id)
                            ? settings.pipelines.filter((x) => x !== p.id)
                            : [...settings.pipelines, p.id],
                          stages: { scheduled: [], attended: [] },
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {(["scheduled", "attended"] as const).map((kind) => (
                <div key={kind} className="rounded-xl border p-4">
                  <h3 className="font-medium mb-3">
                    {kind === "scheduled"
                      ? "Etapas de agendamento"
                      : "Etapas de comparecimento"}
                  </h3>
                  <div className="space-y-3">
                    {funnels.data?.stages
                      .filter(
                        (s) =>
                          !settings.pipelines.length ||
                          settings.pipelines.includes(s.pipeline_id),
                      )
                      .map((stage) => (
                        <label key={stage.id} className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={settings.stages[kind].includes(stage.id)}
                            onChange={() => toggleStage(kind, stage.id)}
                          />
                          {stage.name}
                          <span className="text-muted-foreground">
                            ·{" "}
                            {
                              funnels.data.pipelines.find(
                                (p) => p.id === stage.pipeline_id,
                              )?.name || "Funil legado"
                            }
                          </span>
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Avanços registrados no período, por pessoa. Sem mapeamento:
                    N/D.
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Vendas vêm das oportunidades ganhas e suas datas no CRM, não de
              nomes presumidos de etapas. Não equivalem ao caixa recebido.
            </p>
          </TabsContent>
          <TabsContent value="message" className="space-y-5 pb-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Título</span>
              <Input
                maxLength={100}
                value={settings.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Abertura da mensagem</span>
              <Textarea
                maxLength={400}
                value={settings.intro}
                onChange={(e) => update({ intro: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.includeAds}
                onChange={(e) => update({ includeAds: e.target.checked })}
              />
              Incluir melhores anúncios do período
            </label>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block space-y-2">
                <span className="text-sm">Critério do ranking</span>
                <select
                  className={fieldClass}
                  value={settings.ranking}
                  onChange={(e) =>
                    update({
                      ranking: e.target.value as ReportSettings["ranking"],
                    })
                  }
                >
                  <option value="leads">Mais leads reais</option>
                  <option value="sales">Mais vendas</option>
                  <option value="cpl">Menor custo por lead real</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm">Quantidade de anúncios</span>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={settings.top}
                  onChange={(e) => update({ top: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm">Mínimo de leads por anúncio</span>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={settings.minLeads}
                  onChange={(e) => update({ minLeads: Number(e.target.value) })}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Atribuição por identificador do anúncio e conta autorizada. Sem
              atribuição comprovada, o anúncio não entra no ranking. CPL usa
              apenas leads reais atribuídos à Meta.
            </p>
          </TabsContent>
          <TabsContent value="schedule" className="space-y-5 pb-5">
            {master && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">WhatsApp remetente</span>
                <select
                  className={fieldClass}
                  value={owner}
                  onChange={(e) => {
                    setOwner(e.target.value);
                    setPreview(null);
                  }}
                >
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Frequência</span>
                <select
                  className={fieldClass}
                  value={settings.frequency}
                  onChange={(e) =>
                    update({
                      frequency: e.target.value as ReportSettings["frequency"],
                    })
                  }
                >
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Horário</span>
                <Input
                  type="time"
                  value={settings.time}
                  onChange={(e) => update({ time: e.target.value })}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Fuso horário</span>
                <select
                  className={fieldClass}
                  value={settings.timezone}
                  onChange={(e) => update({ timezone: e.target.value })}
                >
                  {[
                    "America/Sao_Paulo",
                    "America/Manaus",
                    "America/Rio_Branco",
                    "America/Noronha",
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
            </div>
            {settings.frequency === "weekly" && (
              <div className="flex flex-wrap gap-3">
                {days.map((day, i) => (
                  <label
                    className="flex items-center gap-2 border rounded-xl p-3 text-sm"
                    key={day}
                  >
                    <input
                      type="checkbox"
                      checked={settings.weekdays.includes(i)}
                      onChange={() =>
                        update({
                          weekdays: settings.weekdays.includes(i)
                            ? settings.weekdays.filter((x) => x !== i)
                            : [...settings.weekdays, i],
                        })
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            )}
            {settings.frequency === "monthly" && (
              <label className="block space-y-2">
                <span className="text-sm">
                  Dia do mês · ajustado ao último dia em meses curtos
                </span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={settings.monthDay}
                  onChange={(e) => update({ monthDay: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="flex gap-3 border rounded-2xl p-4 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <strong>Ativar envio automático</strong>
                <br />
                <span className="text-muted-foreground">
                  Exige prévia revisada, WhatsApp conectado e participação do
                  remetente no grupo. Desmarque para pausar.
                </span>
              </span>
            </label>
          </TabsContent>
          <TabsContent value="preview" className="space-y-4 pb-5">
            <Button
              disabled={busy || !source}
              onClick={() =>
                execute(async () =>
                  setPreview(
                    await reportsApi({ action: "preview", ...payload }),
                  ),
                )
              }
            >
              Gerar prévia com dados reais
            </Button>
            {!source && (
              <p className="text-sm text-muted-foreground">
                Vincule a conta CRM na primeira etapa.
              </p>
            )}
            {preview ? (
              <>
                <pre className="whitespace-pre-wrap break-words rounded-2xl border p-5 bg-muted/30 text-sm font-sans">
                  {preview.message}
                </pre>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSendConfirm(true)}
                >
                  Enviar agora para o grupo
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nada é enviado ao gerar uma prévia. Mudanças na configuração
                exigem uma nova revisão.
              </p>
            )}
          </TabsContent>
        </Tabs>
        <footer className="flex justify-between items-center gap-3 border-t px-6 py-4">
          <span className="text-xs text-muted-foreground">
            {enabled ? "Agenda ativa após salvar" : "Envio automático pausado"}
          </span>
          <Button
            disabled={busy || !source}
            onClick={() =>
              execute(async () => {
                const saved = await reportsApi<{ version: number }>({
                  action: "save",
                  ...payload,
                  enabled,
                });
                setVersion(saved.version);
                toast.success("Configuração salva.");
                onSaved();
              })
            }
          >
            {busy ? "Aguarde…" : "Salvar configuração"}
          </Button>
        </footer>
        <Dialog open={sendConfirm} onOpenChange={setSendConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar relatório para {client.nome}?</DialogTitle>
              <DialogDescription>
                Esta ação envia uma mensagem real ao grupo vinculado, pelo
                WhatsApp escolhido. Confira a prévia antes de confirmar.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setSendConfirm(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  execute(async () => {
                    await reportsApi({
                      action: "send",
                      ...payload,
                      requestId,
                      confirm: true,
                    });
                    setSendConfirm(false);
                    setRequestId(crypto.randomUUID());
                    toast.success("Relatório na fila. Acompanhe o histórico.");
                    onSaved();
                  })
                }
              >
                Confirmar envio
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
