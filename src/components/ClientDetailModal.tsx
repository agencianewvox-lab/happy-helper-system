import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Grupo } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Clock, Hash, FolderOpen,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Timer, ThumbsUp, ThumbsDown, Users, ShieldAlert,
  CheckCircle2, XCircle, ArrowDown, ArrowUp, ArrowUpRight, ArrowDownRight,
  Briefcase, DollarSign, CalendarDays, Cake, KeyRound, Save, Loader2, Megaphone, UserCheck, AlertCircle, Siren,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MetaAdsTab } from "@/components/MetaAdsTab";

interface Conversa {
  id: string;
  mensagem: string | null;
  nome_contato: string | null;
  direcao: string | null;
  recebido_em: string;
  created_at: string;
}

interface Props {
  grupo: Grupo | null;
  open: boolean;
  onClose: () => void;
}

function formatFrt(minutes: number | null | undefined): string {
  if (minutes == null) return "Sem dados";
  if (minutes < 60) return `${minutes} minutos`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h} horas`;
}

const sentimentConfig = {
  positivo: { icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Positivo" },
  neutro: { icon: Minus, color: "text-amber-500", bg: "bg-amber-500/10", label: "Neutro" },
  negativo: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10", label: "Negativo" },
};

const engagementConfig = {
  "saudável": { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: ThumbsUp, label: "Saudável" },
  "cobrança": { color: "text-red-500", bg: "bg-red-500/10", icon: ThumbsDown, label: "Cobrança" },
  "misto": { color: "text-amber-500", bg: "bg-amber-500/10", icon: Users, label: "Misto" },
  "inativo": { color: "text-muted-foreground", bg: "bg-muted/50", icon: Minus, label: "Inativo" },
};

function churnColor(risk: number): string {
  if (risk >= 80) return "text-red-600";
  if (risk >= 60) return "text-red-500";
  if (risk >= 30) return "text-amber-500";
  return "text-emerald-500";
}

function trendLabel(trend?: string) {
  if (trend === "melhorando") return { icon: ArrowUpRight, color: "text-emerald-500", text: "Melhorando" };
  if (trend === "piorando") return { icon: ArrowDownRight, color: "text-red-500", text: "Piorando" };
  return { icon: Minus, color: "text-muted-foreground", text: "Estável" };
}

export function ClientDetailModal({ grupo, open, onClose }: Props) {
  const [resolutions, setResolutions] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loadingConversas, setLoadingConversas] = useState(false);
  const [clientInfo, setClientInfo] = useState({
    plano: "", investimento_ads: "", data_entrada: "", data_ciclo_ads: "",
    aniversario_cliente: "", aniversario_empresa: "", acessos_cliente: "",
    gestor_responsavel: "", briefing: "",
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const conversasEndRef = useRef<HTMLDivElement>(null);

  const groupId = grupo?.group_id || "";
  const a = grupo?.analytics;

  const makeKey = useCallback((term: string, requestedAt: string) => `${groupId}|${term}|${requestedAt}`, [groupId]);

  const fetchConversas = useCallback(async () => {
    if (!groupId) return;
    setLoadingConversas(true);
    try {
      let all: Conversa[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("whatsapp_conversas")
          .select("id, mensagem, nome_contato, direcao, recebido_em, created_at")
          .eq("group_id", groupId)
          .order("recebido_em", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      setConversas(all);
    } catch (err) { console.error("Error fetching conversas:", err); }
    finally { setLoadingConversas(false); }
  }, [groupId]);

  const fetchResolutions = useCallback(async () => {
    if (!groupId || !a?.pending_demand_details?.length) return;
    const { data } = await supabase.from("pending_demand_resolutions").select("term, requested_at, resolved").eq("group_id", groupId);
    if (data) {
      const map: Record<string, boolean> = {};
      for (const r of data) map[makeKey(r.term, r.requested_at)] = r.resolved;
      setResolutions(map);
    }
  }, [groupId, a?.pending_demand_details, makeKey]);

  const fetchClientInfo = useCallback(async () => {
    if (!grupo?.id) return;
    const { data } = await supabase.from("whatsapp_grupos")
      .select("plano, investimento_ads, data_entrada, data_ciclo_ads, aniversario_cliente, aniversario_empresa, acessos_cliente, gestor_responsavel, briefing")
      .eq("id", grupo.id).single();
    if (data) {
      setClientInfo({
        plano: (data as any).plano || "",
        investimento_ads: (data as any).investimento_ads != null ? String((data as any).investimento_ads) : "",
        data_entrada: (data as any).data_entrada || "",
        data_ciclo_ads: (data as any).data_ciclo_ads || "",
        aniversario_cliente: (data as any).aniversario_cliente || "",
        aniversario_empresa: (data as any).aniversario_empresa || "",
        acessos_cliente: (data as any).acessos_cliente || "",
        gestor_responsavel: (data as any).gestor_responsavel || "",
        briefing: (data as any).briefing || "",
      });
    }
  }, [grupo?.id]);

  const saveClientInfo = useCallback(async () => {
    if (!grupo?.id) return;
    setSavingInfo(true);
    setInfoSaved(false);
    const { error } = await supabase.from("whatsapp_grupos").update({
      plano: clientInfo.plano || null,
      investimento_ads: clientInfo.investimento_ads ? Number(clientInfo.investimento_ads) : null,
      data_entrada: clientInfo.data_entrada || null,
      data_ciclo_ads: clientInfo.data_ciclo_ads || null,
      aniversario_cliente: clientInfo.aniversario_cliente || null,
      aniversario_empresa: clientInfo.aniversario_empresa || null,
      acessos_cliente: clientInfo.acessos_cliente || null,
      gestor_responsavel: clientInfo.gestor_responsavel || null,
      briefing: clientInfo.briefing || null,
    } as any).eq("id", grupo.id);
    setSavingInfo(false);
    if (!error) { setInfoSaved(true); setTimeout(() => setInfoSaved(false), 2000); }
  }, [grupo?.id, clientInfo]);

  useEffect(() => {
    if (open) { fetchResolutions(); fetchConversas(); fetchClientInfo(); }
  }, [open, fetchResolutions, fetchConversas, fetchClientInfo]);

  const conversasByDate = useMemo(() => {
    const groups: Record<string, Conversa[]> = {};
    for (const c of conversas) {
      const dateKey = new Date(c.recebido_em).toLocaleDateString("pt-BR", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(c);
    }
    return groups;
  }, [conversas]);

  const handleResolve = useCallback(async (term: string, requestedAt: string, resolved: boolean) => {
    const key = makeKey(term, requestedAt);
    setSavingKey(key);
    const { error } = await supabase.from("pending_demand_resolutions").upsert(
      { group_id: groupId, term, requested_at: requestedAt, resolved, resolved_at: new Date().toISOString() },
      { onConflict: "group_id,term,requested_at" }
    );
    if (!error) setResolutions((prev) => ({ ...prev, [key]: resolved }));
    setSavingKey(null);
  }, [groupId, makeKey]);

  if (!grupo) return null;

  const sent = a ? sentimentConfig[a.sentiment] : null;
  const eng = a ? engagementConfig[a.engagement_type] : null;
  const SentIcon = sent?.icon || Minus;
  const EngIcon = eng?.icon || Minus;
  const trend = trendLabel(a?.sentiment_trend);
  const TrendIcon = trend.icon;
  const isPriorityMax = a?.priority_level === "maxima";

  const basicItems = [
    { icon: FolderOpen, label: "Categoria", value: grupo.categoria || "Sem categoria" },
    { icon: Hash, label: "Group ID", value: grupo.group_id },
    { icon: MessageSquare, label: "Total de Mensagens", value: String(grupo.total_mensagens) },
    { icon: Clock, label: "Última Atividade", value: grupo.ultimo_horario ? new Date(grupo.ultimo_horario).toLocaleString("pt-BR") : "Sem atividade" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border/50 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {isPriorityMax && <Siren className="w-5 h-5 text-red-500 animate-bounce" />}
            <DialogTitle className="text-xl">{grupo.nome}</DialogTitle>
            {isPriorityMax && (
              <Badge className="text-xs bg-red-600 text-white border-red-600 animate-pulse">
                PRIORIDADE MÁXIMA
              </Badge>
            )}
            {a && a.churn_risk >= 60 && !isPriorityMax && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Risco
              </Badge>
            )}
          </div>
          {isPriorityMax && a?.priority_reason && (
            <p className="text-xs text-red-500 font-semibold mt-1">🚨 {a.priority_reason}</p>
          )}
        </DialogHeader>

        <Tabs defaultValue="indicadores" className="mt-2" onValueChange={(val) => {
          if (val === "conversas") setTimeout(() => conversasEndRef.current?.scrollIntoView({ behavior: "auto" }), 100);
        }}>
          <TabsList className="w-full">
            <TabsTrigger value="indicadores" className="flex-1">Indicadores</TabsTrigger>
            <TabsTrigger value="conversas" className="flex-1">Conversas ({conversas.length})</TabsTrigger>
            <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
            <TabsTrigger value="meta-ads" className="flex-1 gap-1"><Megaphone className="w-3 h-3" /> Ads</TabsTrigger>
          </TabsList>

          <TabsContent value="indicadores" className="space-y-4 mt-4">
            {a ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {/* FRT */}
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Timer className="w-4 h-4 text-primary" />
                      <span className="text-xs text-muted-foreground font-medium">Tempo Médio 1ª Resposta</span>
                    </div>
                    <p className="text-lg font-bold">{formatFrt(a.avg_frt_minutes)}</p>
                  </div>

                  {/* Sentiment + Trend */}
                  <div className={cn("p-3 rounded-lg border border-border/30", sent?.bg)}>
                    <div className="flex items-center gap-2 mb-1">
                      <SentIcon className={cn("w-4 h-4", sent?.color)} />
                      <span className="text-xs text-muted-foreground font-medium">Sentimento</span>
                    </div>
                    <p className={cn("text-lg font-bold", sent?.color)}>{sent?.label}</p>
                    <p className="text-[10px] text-muted-foreground">Score: {a.sentiment_score}</p>
                    <div className={cn("flex items-center gap-1 mt-1 text-[10px] font-medium", trend.color)}>
                      <TrendIcon className="w-3 h-3" />
                      {trend.text}
                    </div>
                  </div>

                  {/* Engagement */}
                  <div className={cn("p-3 rounded-lg border border-border/30", eng?.bg)}>
                    <div className="flex items-center gap-2 mb-1">
                      <EngIcon className={cn("w-4 h-4", eng?.color)} />
                      <span className="text-xs text-muted-foreground font-medium">Engajamento</span>
                    </div>
                    <p className={cn("text-lg font-bold", eng?.color)}>{eng?.label}</p>
                    <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                      <span>👍 {a.positive_count}</span>
                      <span>👎 {a.complaint_count}</span>
                      <span>📢 {a.demand_count}</span>
                    </div>
                  </div>

                  {/* Churn Risk with Drivers */}
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30 col-span-2">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className={cn("w-4 h-4", churnColor(a.churn_risk))} />
                      <span className="text-xs text-muted-foreground font-medium">Risco de Churn</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn("text-lg font-bold", churnColor(a.churn_risk))}>{a.churn_risk}%</p>
                      <Badge variant="outline" className={cn("text-[10px]", churnColor(a.churn_risk))}>
                        {a.churn_risk_label || (a.churn_risk >= 80 ? "Crítico" : a.churn_risk >= 60 ? "Alto" : a.churn_risk >= 30 ? "Moderado" : "Baixo")}
                      </Badge>
                    </div>
                    <Progress value={a.churn_risk} className="h-1.5 mt-2" />

                    {/* Churn Drivers */}
                    {a.churn_drivers && a.churn_drivers.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Fatores de Risco</p>
                        {a.churn_drivers.map((driver, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs gap-2">
                            <span className="text-muted-foreground truncate flex-1">{driver.label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", driver.points >= 15 ? "bg-red-500" : driver.points >= 8 ? "bg-amber-500" : "bg-blue-500")}
                                  style={{ width: `${Math.min(driver.points / 30 * 100, 100)}%` }}
                                />
                              </div>
                              <span className={cn("font-semibold tabular-nums w-8 text-right",
                                driver.points >= 15 ? "text-red-500" : driver.points >= 8 ? "text-amber-500" : "text-muted-foreground"
                              )}>
                                +{driver.points}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs border-t border-border/30 pt-1.5 mt-1">
                          <span className="font-semibold">Total</span>
                          <span className={cn("font-bold", churnColor(a.churn_risk))}>{a.churn_risk}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Critical Terms */}
                {a.critical_terms && a.critical_terms.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-600/10 border border-red-600/30">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-xs font-bold text-red-600 uppercase tracking-wider">⚠️ TERMOS CRÍTICOS</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {a.critical_terms.map((term) => (
                        <Badge key={term} className="text-[10px] bg-red-600/20 text-red-600 border-red-600/40 font-bold">
                          "{term}"
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Complaint Terms (non-critical) */}
                {a.complaint_terms.length > 0 && (
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <span className="text-xs font-medium text-destructive">Termos de Atrito Detectados</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {a.complaint_terms.map((term) => (
                        <Badge key={term} variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                          "{term}"
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending Demands */}
                {a.has_pending_demands && (() => {
                  const unresolvedDetails = (a.pending_demand_details || []).filter((d) => {
                    const key = makeKey(d.term, d.requested_at);
                    return resolutions[key] !== true;
                  });
                  if (unresolvedDetails.length === 0) return null;

                  const confirmadas = unresolvedDetails.filter(d => d.category === "confirmada" || d.confidence === "alta");
                  const possiveis = unresolvedDetails.filter(d => d.category === "possivel" || d.confidence === "media");

                  const renderDetail = (d: typeof unresolvedDetails[0], i: number, isPossivel: boolean) => {
                    const dt = new Date(d.requested_at);
                    const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
                    const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                    const key = makeKey(d.term, d.requested_at);
                    const isSaving = savingKey === key;
                    const priorityBadge = d.priority === "urgente"
                      ? <Badge className="text-[9px] bg-red-500/20 text-red-500 border-red-500/30">🔴 Urgente</Badge>
                      : d.priority === "baixa"
                        ? <Badge variant="outline" className="text-[9px] text-muted-foreground">⚪ Baixa</Badge>
                        : <Badge className="text-[9px] bg-amber-500/20 text-amber-500 border-amber-500/30">🟡 Normal</Badge>;
                    return (
                      <div key={i} className={cn(
                        "text-xs text-muted-foreground rounded p-2 border bg-muted/30",
                        isPossivel ? "border-dashed border-muted-foreground/30" : "border-border/20"
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          {priorityBadge}
                          {d.hours_waiting > 0 && <span className="text-[10px] text-muted-foreground">⏱ {d.hours_waiting}h esperando</span>}
                        </div>
                        {d.message_excerpt && <p className="mt-1 italic text-[11px] text-foreground/80">"{d.message_excerpt}"</p>}
                        <p className="mt-1 text-[10px]">Solicitado em <strong>{dateStr}</strong> às <strong>{timeStr}</strong></p>
                        {d.suggested_solution && (
                          <p className="mt-1 text-[10px] text-emerald-400">
                            <span className="font-semibold">Ação sugerida: </span>{d.suggested_solution}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={isSaving} onClick={() => handleResolve(d.term, d.requested_at, true)}>
                            <CheckCircle2 className="w-3 h-3" /> Resolvido
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
                            disabled={isSaving} onClick={() => handleResolve(d.term, d.requested_at, true)}>
                            <XCircle className="w-3 h-3" /> Não é pendência
                          </Button>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {confirmadas.length > 0 && (
                        <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                            <span className="text-xs font-medium text-orange-500 uppercase tracking-wider">
                              Pendências Confirmadas ({confirmadas.length})
                            </span>
                          </div>
                          <div className="space-y-2">{confirmadas.map((d, i) => renderDetail(d, i, false))}</div>
                        </div>
                      )}
                      {possiveis.length > 0 && (
                        <div className="p-3 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/20">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Possíveis Pendências ({possiveis.length})
                            </span>
                          </div>
                          <div className="space-y-2">{possiveis.map((d, i) => renderDetail(d, i, true))}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <span className="text-xs text-muted-foreground font-medium">Mensagens</span>
                  <div className="flex gap-4 mt-1 text-sm">
                    <span>📥 Cliente: <strong>{a.total_client_msgs}</strong></span>
                    <span>📤 Equipe: <strong>{a.total_team_msgs}</strong></span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados de indicadores disponíveis.</p>
            )}
          </TabsContent>

          {/* Tab: Conversas */}
          <TabsContent value="conversas" className="mt-4">
            {loadingConversas ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando conversas...</p>
            ) : conversas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conversa registrada.</p>
            ) : (
              <ScrollArea className="h-[55vh]">
                <div className="space-y-4 pr-4">
                  {Object.entries(conversasByDate).map(([dateLabel, msgs]) => (
                    <div key={dateLabel}>
                      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm py-1.5 mb-2">
                        <Badge variant="secondary" className="text-[10px] font-medium capitalize">📅 {dateLabel}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-2">{msgs.length} mensagens</span>
                      </div>
                      <div className="space-y-1.5">
                        {msgs.map((c) => {
                          const time = new Date(c.recebido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                          const isOutgoing = c.direcao === "saida";
                          return (
                            <div key={c.id} className={cn("flex gap-2 text-xs", isOutgoing ? "flex-row-reverse" : "flex-row")}>
                              <div className={cn("max-w-[80%] rounded-lg px-3 py-2 border",
                                isOutgoing ? "bg-primary/10 border-primary/20 text-foreground" : "bg-muted/40 border-border/30 text-foreground"
                              )}>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-semibold text-[10px]">
                                    {isOutgoing ? (
                                      <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3 text-primary" />{c.nome_contato || "Equipe"}</span>
                                    ) : (
                                      <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3 text-muted-foreground" />{c.nome_contato || "Cliente"}</span>
                                    )}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground">{time}</span>
                                </div>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{c.mensagem || "[sem conteúdo]"}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div ref={conversasEndRef} />
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Tab: Informações */}
          <TabsContent value="info" className="space-y-4 mt-4">
            {basicItems.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-sm mt-0.5 break-all">{value}</p>
                </div>
              </div>
            ))}

            {grupo.ultima_mensagem && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <MessageSquare className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Última Mensagem</p>
                  <p className="text-sm mt-0.5 italic">"{grupo.ultima_mensagem}"</p>
                </div>
              </div>
            )}

            <div className="border-t border-border/40 pt-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">📌 Dados do Cliente</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                  <Briefcase className="w-4 h-4 mt-2 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Plano</Label>
                    <Input value={clientInfo.plano} onChange={(e) => setClientInfo(prev => ({ ...prev, plano: e.target.value }))} placeholder="Ex: SM + Tráfego Pago" className="mt-1 h-8 text-sm bg-background/50" />
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <DollarSign className="w-4 h-4 mt-2 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Investimento em Ads</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <Input type="number" value={clientInfo.investimento_ads} onChange={(e) => setClientInfo(prev => ({ ...prev, investimento_ads: e.target.value }))} placeholder="0,00" className="h-8 text-sm pl-9 bg-background/50" />
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                  <CalendarDays className="w-4 h-4 mt-2 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Data de Entrada</Label>
                    <Input type="date" value={clientInfo.data_entrada} onChange={(e) => setClientInfo(prev => ({ ...prev, data_entrada: e.target.value }))} className="mt-1 h-8 text-sm bg-background/50" />
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <CalendarDays className="w-4 h-4 mt-2 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Data de Ciclo de Ads</Label>
                    <Input type="date" value={clientInfo.data_ciclo_ads} onChange={(e) => setClientInfo(prev => ({ ...prev, data_ciclo_ads: e.target.value }))} className="mt-1 h-8 text-sm bg-background/50" />
                    {clientInfo.data_ciclo_ads && (
                      <p className="text-[10px] text-muted-foreground mt-1">Próximo ciclo: {new Date(new Date(clientInfo.data_ciclo_ads).getTime() + 30 * 86400000).toLocaleDateString("pt-BR")}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                    <Cake className="w-4 h-4 mt-2 text-pink-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground font-medium">Aniv. Cliente</Label>
                      <Input type="date" value={clientInfo.aniversario_cliente} onChange={(e) => setClientInfo(prev => ({ ...prev, aniversario_cliente: e.target.value }))} className="mt-1 h-8 text-sm bg-background/50" />
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                    <Cake className="w-4 h-4 mt-2 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground font-medium">Aniv. Empresa</Label>
                      <Input type="date" value={clientInfo.aniversario_empresa} onChange={(e) => setClientInfo(prev => ({ ...prev, aniversario_empresa: e.target.value }))} className="mt-1 h-8 text-sm bg-background/50" />
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <UserCheck className="w-4 h-4 mt-2 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Gestor Responsável</Label>
                    <Select value={clientInfo.gestor_responsavel} onValueChange={(val) => setClientInfo(prev => ({ ...prev, gestor_responsavel: val }))}>
                      <SelectTrigger className="mt-1 h-8 text-sm bg-background/50"><SelectValue placeholder="Selecione o gestor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Netto Monge">Netto Monge</SelectItem>
                        <SelectItem value="Murilo Araújo">Murilo Araújo</SelectItem>
                        <SelectItem value="Jader Costa">Jader Costa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                  <KeyRound className="w-4 h-4 mt-2 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Acessos do Cliente</Label>
                    <Textarea value={clientInfo.acessos_cliente} onChange={(e) => setClientInfo(prev => ({ ...prev, acessos_cliente: e.target.value }))} placeholder="Logins, senhas, links de acesso..." className="mt-1 text-sm bg-background/50 min-h-[60px]" />
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                  <Briefcase className="w-4 h-4 mt-2 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground font-medium">Briefing</Label>
                    <Textarea value={clientInfo.briefing} onChange={(e) => setClientInfo(prev => ({ ...prev, briefing: e.target.value }))} placeholder="Descreva o briefing do cliente..." className="mt-1 text-sm bg-background/50 min-h-[80px]" />
                  </div>
                </div>
                <Button onClick={saveClientInfo} disabled={savingInfo} className="w-full gap-2" variant={infoSaved ? "outline" : "default"}>
                  {savingInfo ? (<><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>) : infoSaved ? (<><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Salvo!</>) : (<><Save className="w-4 h-4" /> Salvar Informações</>)}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="meta-ads" className="mt-4">
            <MetaAdsTab grupoId={grupo.group_id} grupoDbId={grupo.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
