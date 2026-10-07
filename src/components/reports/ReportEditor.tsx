import { useState, useRef } from "react";
import { WhatsAppPreview } from "./WhatsAppPreview";
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
  metricTokens,
  templateFromSettings,
  unknownTokens,
  reportPeriod,
  crmMetrics,
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
  custom: "Escolher datas",
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
    structuredClone(
      config?.settings
        ? { ...defaultSettings, ...config.settings }
        : source
          ? { ...defaultSettings, dataMode: "crm_meta" }
          : {
              ...defaultSettings,
              dataMode: "meta",
              metrics: ["spend", "impressions", "clicks", "ctr", "cpc", "cpm"],
              ranking: "clicks",
            },
    ),
  );
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const [campaignSearch, setCampaignSearch] = useState("");
  const metaOnly = settings.dataMode === "meta";
  const canConfigure = metaOnly ? !!client.ad_account_id : !!source;
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
  const campaigns = useQuery({
    queryKey: [
      "report-campaign-catalog",
      userId,
      client.id,
      client.ad_account_id,
    ],
    enabled: !!client.ad_account_id && tab === "metrics",
    queryFn: () =>
      reportsApi<{
        campaigns: { id: string; name: string; effective_status: string }[];
      }>({ action: "campaign-catalog", clientId: client.id }),
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
  const template = settings.template ?? "";
  const tokenErrors = unknownTokens(template);
  let periodLabel = "Selecione as datas";
  try {
    const p = reportPeriod(settings);
    periodLabel =
      p.startDate.split("-").reverse().join("/") +
      " → " +
      p.endDate.split("-").reverse().join("/");
  } catch {
    /* incomplete editing state */
  }
  const insertToken = (token: string) => {
    const text = settings.template || templateFromSettings(settings);
    const start = settings.template
      ? (messageInput.current?.selectionStart ?? text.length)
      : text.length;
    const end = settings.template
      ? (messageInput.current?.selectionEnd ?? start)
      : start;
    const insertion = "{{" + token + "}}";
    update({ template: text.slice(0, start) + insertion + text.slice(end) });
    requestAnimationFrame(() => {
      messageInput.current?.focus();
      messageInput.current?.setSelectionRange(
        start + insertion.length,
        start + insertion.length,
      );
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-6xl max-h-[94dvh] overflow-y-auto p-0">
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
        <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/20 p-4">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">
              Fontes do relatório
            </span>
            <select
              className={fieldClass}
              value={settings.dataMode || "crm_meta"}
              onChange={(e) => {
                const mode = e.target.value as "meta" | "crm_meta";
                update({
                  dataMode: mode,
                  metrics:
                    mode === "meta"
                      ? settings.metrics.filter((m) => !crmMetrics.includes(m))
                          .length
                        ? settings.metrics.filter(
                            (m) => !crmMetrics.includes(m),
                          )
                        : ["spend", "clicks", "impressions"]
                      : defaultSettings.metrics,
                  ranking: mode === "meta" ? "clicks" : "leads",
                  pipelines: [],
                  stages: { scheduled: [], attended: [] },
                  template: "",
                });
              }}
            >
              <option value="crm_meta">Meta Ads + comercial do Voxi</option>
              <option value="meta">Somente Meta Ads · sem CRM</option>
            </select>
          </label>
          <p className="max-w-sm text-xs text-muted-foreground">
            {metaOnly
              ? "Não exige vínculo com o Voxi. Cliques não são leads reais."
              : "Leads reais e vendas vêm do CRM. A regra comercial atual está mantida."}{" "}
            Ao mudar a fonte, o modelo personalizado é reiniciado.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="px-6">
          <TabsList className="w-full justify-start overflow-x-auto my-4">
            <TabsTrigger value="sources">1. Fontes</TabsTrigger>
            <TabsTrigger value="metrics">2. Métricas e campanhas</TabsTrigger>
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
            {settings.period === "custom" ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-sm">Data inicial</span>
                  <Input
                    type="date"
                    value={settings.customStart || ""}
                    onChange={(e) => update({ customStart: e.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm">Data final (incluída)</span>
                  <Input
                    type="date"
                    value={settings.customEnd || ""}
                    onChange={(e) => update({ customEnd: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
            {["last7", "last30"].includes(settings.period) ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.includeToday || false}
                  onChange={(e) => update({ includeToday: e.target.checked })}
                />
                Incluir hoje (dia ainda em andamento)
              </label>
            ) : null}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <strong>{periodLabel}</strong>
              <p className="mt-1 text-xs text-muted-foreground">
                Compare com as mesmas datas e filtros no Voxi. Dados de hoje
                ainda podem mudar.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {Object.entries(metricLabels).map(([m, label]) => (
                <label
                  className="flex items-center gap-3 border rounded-xl p-3 text-sm"
                  key={m}
                  style={
                    metaOnly && crmMetrics.includes(m as Metric)
                      ? { display: "none" }
                      : undefined
                  }
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
            <div className="rounded-2xl border p-4 space-y-3">
              <h3 className="font-semibold text-sm">Ordem no formato padrão</h3>
              <p className="text-xs text-muted-foreground">
                Mova as métricas abaixo. Na mensagem personalizada, a ordem é a
                que você escrever no texto.
              </p>
              {settings.metrics.map((m, index) => (
                <div
                  key={m}
                  className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground w-5">
                    {index + 1}
                  </span>
                  <span className="flex-1">{metricLabels[m]}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={"Mover " + metricLabels[m] + " para cima"}
                    disabled={index === 0}
                    onClick={() => {
                      const metrics = [...settings.metrics];
                      [metrics[index - 1], metrics[index]] = [
                        metrics[index],
                        metrics[index - 1],
                      ];
                      update({ metrics });
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={"Mover " + metricLabels[m] + " para baixo"}
                    disabled={index === settings.metrics.length - 1}
                    onClick={() => {
                      const metrics = [...settings.metrics];
                      [metrics[index + 1], metrics[index]] = [
                        metrics[index],
                        metrics[index + 1],
                      ];
                      update({ metrics });
                    }}
                  >
                    ↓
                  </Button>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Campanhas incluídas</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sem seleção: toda a conta Meta. O filtro limita mídia, custo
                    por lead e ranking; não altera os totais comerciais do CRM.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update({ campaignIds: [] })}
                >
                  Usar todas as campanhas
                </Button>
              </div>
              <Input
                aria-label="Buscar campanha"
                placeholder="Buscar pelo nome da campanha…"
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
              />
              {campaigns.isPending && client.ad_account_id ? (
                <p role="status" className="text-sm">
                  Carregando campanhas da conta vinculada…
                </p>
              ) : null}
              {campaigns.error ? (
                <div role="alert" className="text-sm text-destructive">
                  {campaigns.error.message}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void campaigns.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : null}
              {!client.ad_account_id ? (
                <p className="text-sm text-muted-foreground">
                  Vincule a conta Meta na área Anúncios do card.
                </p>
              ) : null}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {campaigns.data?.campaigns
                  .filter((c) =>
                    c.name
                      .toLocaleLowerCase()
                      .includes(campaignSearch.toLocaleLowerCase()),
                  )
                  .map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 rounded-xl border p-3 text-sm hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={settings.campaignIds?.includes(c.id) || false}
                        onChange={() =>
                          update({
                            campaignIds: settings.campaignIds?.includes(c.id)
                              ? settings.campaignIds.filter((x) => x !== c.id)
                              : [...(settings.campaignIds || []), c.id],
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium">
                          {c.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.id} ·{" "}
                          {c.effective_status === "ACTIVE"
                            ? "Ativa"
                            : c.effective_status === "PAUSED"
                              ? "Pausada"
                              : c.effective_status}
                        </span>
                      </span>
                    </label>
                  ))}
              </div>
              <p className="text-xs font-medium text-primary">
                {settings.campaignIds?.length
                  ? settings.campaignIds.length + " campanha(s) selecionada(s)"
                  : "Todas as campanhas da conta"}
              </p>
              <label className="flex gap-2 items-center text-sm">
                <input
                  type="checkbox"
                  checked={settings.includeCampaigns || false}
                  onChange={(e) =>
                    update({ includeCampaigns: e.target.checked })
                  }
                />
                Incluir desempenho de cada campanha na mensagem
              </label>
            </div>
            {!metaOnly ? (
              <div className="space-y-6">
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
                            <label
                              key={stage.id}
                              className="flex gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={settings.stages[kind].includes(
                                  stage.id,
                                )}
                                onChange={() => toggleStage(kind, stage.id)}
                              />
                              {stage.name}
                              <span className="text-muted-foreground">
                                ·{" "}
                                {funnels.data.pipelines.find(
                                  (p) => p.id === stage.pipeline_id,
                                )?.name || "Funil legado"}
                              </span>
                            </label>
                          ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        Avanços registrados no período, por pessoa. Sem
                        mapeamento: N/D.
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vendas permanecem na regra atual de oportunidades ganhas. A
                  conciliação com o dashboard/Clinicorp ficou pendente para uma
                  próxima revisão.
                </p>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="message" className="space-y-5 pb-5">
            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    Sua mensagem, na sua ordem
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Escreva livremente e insira os números onde quiser. As
                    variáveis serão substituídas pelos dados do período.
                  </p>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">
                    Mensagem personalizada
                  </span>
                  <Textarea
                    ref={messageInput}
                    rows={12}
                    maxLength={7000}
                    value={template}
                    placeholder={templateFromSettings(settings)}
                    onChange={(e) => update({ template: e.target.value })}
                    className="font-mono text-sm leading-6"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update({ template: templateFromSettings(settings) })
                    }
                  >
                    Usar modelo das métricas
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update({ template: "" })}
                  >
                    Voltar ao formato padrão
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Clique para inserir no cursor. Use *negrito*, _itálico_ e
                  quebras de linha. Texto vazio mantém o formato padrão.
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(metricTokens)
                    .filter(
                      ([metric]) =>
                        !metaOnly || !crmMetrics.includes(metric as Metric),
                    )
                    .map(([metric, token]) => (
                      <Button
                        key={token}
                        variant="outline"
                        size="sm"
                        onClick={() => insertToken(token)}
                      >
                        {metricLabels[metric as Metric]}
                      </Button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "cliente",
                    "periodo",
                    "titulo",
                    "abertura",
                    "melhores_anuncios",
                    "campanhas",
                  ].map((token) => (
                    <Button
                      key={token}
                      size="sm"
                      variant="secondary"
                      onClick={() => insertToken(token)}
                    >
                      {"{{" + token + "}}"}
                    </Button>
                  ))}
                </div>
                {tokenErrors.length ? (
                  <p role="alert" className="text-sm text-destructive">
                    Variáveis desconhecidas: {tokenErrors.join(", ")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {
                    "Exemplo: Valor investido: {{investimento}} · Leads: {{leads_reais}}. Os nomes “meta ads” e “Leads reais voxi” também são aceitos."
                  }
                </p>
              </div>
              <div className="lg:sticky lg:top-4">
                <WhatsAppPreview
                  name={client.nome}
                  message={template || templateFromSettings(settings)}
                  draft
                />
              </div>
            </div>
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
                  {!metaOnly ? (
                    <>
                      <option value="leads">Mais leads reais</option>
                      <option value="sales">Mais vendas</option>
                      <option value="cpl">Menor custo por lead real</option>
                    </>
                  ) : null}
                  <option value="clicks">Mais cliques no link</option>
                  <option value="spend">Maior investimento</option>
                  <option value="ctr">Maior CTR de link</option>
                  <option value="cpc">Menor custo por clique</option>
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
                <span className="text-sm">
                  {metaOnly
                    ? "Mínimo de cliques por anúncio"
                    : "Mínimo de leads por anúncio (ranking comercial)"}
                </span>
                <Input
                  type="number"
                  min={metaOnly ? 0 : 1}
                  max={metaOnly ? 1000000000 : 1000}
                  value={metaOnly ? settings.minClicks || 0 : settings.minLeads}
                  onChange={(e) =>
                    update(
                      metaOnly
                        ? { minClicks: Number(e.target.value) }
                        : { minLeads: Number(e.target.value) },
                    )
                  }
                />
              </label>
            </div>
            <label className="block space-y-2">
              <span className="text-sm">
                Mínimo de impressões por anúncio no ranking
              </span>
              <Input
                type="number"
                min={0}
                max={1000000000}
                value={settings.minImpressions || 0}
                onChange={(e) =>
                  update({ minImpressions: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Evita destacar anúncios com pouca amostra. Zero: sem mínimo.
              </p>
            </label>
            <p className="text-xs text-muted-foreground">
              {metaOnly
                ? "Ranking baseado em métricas da Meta nas campanhas escolhidas. Não informa leads ou vendas do CRM."
                : "Ranking comercial exige atribuição por identificador do anúncio. CPL usa somente leads reais atribuídos aos anúncios da conta e campanhas selecionadas."}
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
                  <option value="once">Uma vez, em uma data</option>
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
            {settings.frequency === "once" ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium">Data do envio único</span>
                <Input
                  type="date"
                  value={settings.onceDate || ""}
                  onChange={(e) => update({ onceDate: e.target.value })}
                />
              </label>
            ) : null}
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm">Começar a enviar em (opcional)</span>
                <Input
                  type="date"
                  value={settings.scheduleStart || ""}
                  onChange={(e) => update({ scheduleStart: e.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm">Encerrar envios em (opcional)</span>
                <Input
                  type="date"
                  value={settings.scheduleEnd || ""}
                  onChange={(e) => update({ scheduleEnd: e.target.value })}
                />
              </label>
            </div>
            {settings.frequency === "daily" ? (
              <label className="flex gap-2 items-center text-sm">
                <input
                  type="checkbox"
                  checked={settings.skipWeekends || false}
                  onChange={(e) => update({ skipWeekends: e.target.checked })}
                />
                Enviar somente em dias úteis (segunda a sexta)
              </label>
            ) : null}
            <div className="rounded-2xl border bg-primary/5 p-4 text-sm space-y-1">
              <p className="font-semibold">Resumo da sua agenda</p>
              <p>
                {settings.frequency === "weekly"
                  ? "Toda semana: " +
                    settings.weekdays.map((d) => days[d]).join(", ")
                  : settings.frequency === "monthly"
                    ? "Todo mês no dia " + settings.monthDay
                    : settings.frequency === "once"
                      ? "Envio único em " +
                        (settings.onceDate || "data a escolher")
                      : settings.skipWeekends
                        ? "Segunda a sexta"
                        : "Todos os dias"}{" "}
                às {settings.time} · {settings.timezone}
              </p>
              <p className="text-muted-foreground">
                Período do relatório: {periodLabel}. No máximo um envio
                automático por cliente/dia.
              </p>
              {settings.period === "custom" ? (
                <p className="text-amber-600 dark:text-amber-300">
                  Datas fixas: envio manual ou agenda de uma única vez, para não
                  repetir o mesmo relatório.
                </p>
              ) : null}
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
              disabled={busy || !canConfigure || tokenErrors.length > 0}
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
            {!canConfigure && (
              <p className="text-sm text-muted-foreground">
                {metaOnly
                  ? "Vincule a conta Meta na área Anúncios do card."
                  : "Vincule a conta CRM na primeira etapa ou escolha somente Meta."}
              </p>
            )}
            {preview ? (
              <>
                <div className="max-w-2xl mx-auto">
                  <WhatsAppPreview
                    name={client.nome}
                    message={preview.message}
                  />
                </div>
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
        <footer className="sticky bottom-0 flex flex-wrap justify-between items-center gap-3 border-t bg-background/95 backdrop-blur px-6 py-4">
          <span className="text-xs text-muted-foreground">
            {enabled ? "Agenda ativa após salvar" : "Envio automático pausado"}
          </span>
          <div className="flex items-center gap-2">
            {tab !== "sources" ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  const steps = [
                    "sources",
                    "metrics",
                    "message",
                    "schedule",
                    "preview",
                  ];
                  setTab(steps[steps.indexOf(tab) - 1]);
                }}
              >
                Voltar
              </Button>
            ) : null}
            {tab !== "preview" ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const steps = [
                    "sources",
                    "metrics",
                    "message",
                    "schedule",
                    "preview",
                  ];
                  setTab(steps[steps.indexOf(tab) + 1]);
                }}
              >
                Próxima etapa
              </Button>
            ) : null}
            <Button
              disabled={busy || !canConfigure || tokenErrors.length > 0}
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
          </div>
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
