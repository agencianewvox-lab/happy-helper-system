import { useState, useEffect, useCallback, useMemo } from "react";
import { Grupo } from "@/types/client";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Clock, Hash, FolderOpen,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Timer, ThumbsUp, ThumbsDown, Users, ShieldAlert,
  CheckCircle2, XCircle, ArrowDown, ArrowUp,
} from "lucide-react";

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
  if (risk >= 70) return "text-red-500";
  if (risk >= 40) return "text-amber-500";
  return "text-emerald-500";
}

function churnLabel(risk: number): string {
  if (risk >= 70) return "Alto";
  if (risk >= 40) return "Moderado";
  return "Baixo";
}

export function ClientDetailModal({ grupo, open, onClose }: Props) {
  // Resolution state - hooks must be before early returns
  const [resolutions, setResolutions] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const groupId = grupo?.group_id || "";
  const a = grupo?.analytics;

  const makeKey = useCallback((term: string, requestedAt: string) => `${groupId}|${term}|${requestedAt}`, [groupId]);

  const fetchResolutions = useCallback(async () => {
    if (!groupId || !a?.pending_demand_details?.length) return;
    const { data } = await supabase
      .from("pending_demand_resolutions")
      .select("term, requested_at, resolved")
      .eq("group_id", groupId);
    if (data) {
      const map: Record<string, boolean> = {};
      for (const r of data) {
        map[makeKey(r.term, r.requested_at)] = r.resolved;
      }
      setResolutions(map);
    }
  }, [groupId, a?.pending_demand_details, makeKey]);

  useEffect(() => {
    if (open) fetchResolutions();
  }, [open, fetchResolutions]);

  const handleResolve = useCallback(async (term: string, requestedAt: string, resolved: boolean) => {
    const key = makeKey(term, requestedAt);
    setSavingKey(key);
    const { error } = await supabase
      .from("pending_demand_resolutions")
      .upsert(
        { group_id: groupId, term, requested_at: requestedAt, resolved, resolved_at: new Date().toISOString() },
        { onConflict: "group_id,term,requested_at" }
      );
    if (!error) {
      setResolutions((prev) => ({ ...prev, [key]: resolved }));
    }
    setSavingKey(null);
  }, [groupId, makeKey]);

  if (!grupo) return null;

  const sent = a ? sentimentConfig[a.sentiment] : null;
  const eng = a ? engagementConfig[a.engagement_type] : null;
  const SentIcon = sent?.icon || Minus;
  const EngIcon = eng?.icon || Minus;


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
            <DialogTitle className="text-xl">{grupo.nome}</DialogTitle>
            {a && a.churn_risk >= 60 && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Risco
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Analytics Section */}
        {a && (
          <div className="space-y-4 mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Indicadores</h3>

            <div className="grid grid-cols-2 gap-3">
              {/* FRT */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground font-medium">Tempo Médio 1ª Resposta</span>
                </div>
                <p className="text-lg font-bold">{formatFrt(a.avg_frt_minutes)}</p>
              </div>

              {/* Sentiment */}
              <div className={cn("p-3 rounded-lg border border-border/30", sent?.bg)}>
                <div className="flex items-center gap-2 mb-1">
                  <SentIcon className={cn("w-4 h-4", sent?.color)} />
                  <span className="text-xs text-muted-foreground font-medium">Sentimento</span>
                </div>
                <p className={cn("text-lg font-bold", sent?.color)}>{sent?.label}</p>
                <p className="text-[10px] text-muted-foreground">Score: {a.sentiment_score}</p>
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

              {/* Churn Risk */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className={cn("w-4 h-4", churnColor(a.churn_risk))} />
                  <span className="text-xs text-muted-foreground font-medium">Risco de Churn</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className={cn("text-lg font-bold", churnColor(a.churn_risk))}>{a.churn_risk}%</p>
                  <Badge variant="outline" className={cn("text-[10px]", churnColor(a.churn_risk))}>
                    {churnLabel(a.churn_risk)}
                  </Badge>
                </div>
                <Progress value={a.churn_risk} className="h-1.5 mt-2" />

                {/* Breakdown */}
                {a.churn_breakdown && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Composição do Score</p>
                    {[
                      { label: "Base", value: a.churn_breakdown.base, icon: "🔹" },
                      { label: "Insatisfação", value: a.churn_breakdown.dissatisfaction, icon: "😡" },
                      { label: "Reclamações", value: a.churn_breakdown.complaints, icon: "⚠️" },
                      { label: "Cobranças", value: a.churn_breakdown.demands, icon: "📢" },
                      { label: "Positivos", value: a.churn_breakdown.positive, icon: "👍" },
                      { label: "Tempo de resposta", value: a.churn_breakdown.frt, icon: "⏱" },
                      { label: "Sem resposta", value: a.churn_breakdown.no_response, icon: "🔇" },
                      { label: "Inatividade", value: a.churn_breakdown.inactivity, icon: "💤" },
                    ].filter(item => item.value !== 0).map(({ label, value, icon }) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <span>{icon}</span> {label}
                        </span>
                        <span className={cn(
                          "font-semibold tabular-nums",
                          value > 0 ? "text-red-400" : "text-emerald-400"
                        )}>
                          {value > 0 ? `+${value}` : value}
                        </span>
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

            {/* Complaints */}
            {a.complaint_terms.length > 0 && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-red-500">Termos de Atrito Detectados</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.complaint_terms.map((term) => (
                    <Badge key={term} variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                      "{term}"
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Demands - Motivo Pendência (hide resolved) */}
            {a.has_pending_demands && (() => {
              const unresolvedDetails = (a.pending_demand_details || []).filter((d) => {
                const key = makeKey(d.term, d.requested_at);
                return resolutions[key] !== true;
              });
              if (unresolvedDetails.length === 0) return null;
              return (
                <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-medium text-orange-500 uppercase tracking-wider">Motivo Pendência</span>
                  </div>
                  <div className="space-y-2">
                    {unresolvedDetails.map((d, i) => {
                      const dt = new Date(d.requested_at);
                      const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                      const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      const key = makeKey(d.term, d.requested_at);
                      const isSaving = savingKey === key;
                      return (
                        <div key={i} className="text-xs text-muted-foreground rounded p-2 border bg-muted/30 border-border/20">
                          <p>
                            Cliente solicitou <strong className="text-orange-400">{d.term}</strong> em{" "}
                            <strong>{dateStr}</strong> às <strong>{timeStr}</strong>
                            {" e ainda não foi atendido."}
                          </p>
                          {d.message_excerpt && (
                            <p className="mt-1 italic text-[10px] text-muted-foreground/70 truncate">
                              "{d.message_excerpt}"
                            </p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={isSaving}
                              onClick={() => handleResolve(d.term, d.requested_at, true)}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Resolvido
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 gap-1"
                              disabled={isSaving}
                              onClick={() => handleResolve(d.term, d.requested_at, false)}
                            >
                              <XCircle className="w-3 h-3" />
                              Não resolvido
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Message breakdown */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-xs text-muted-foreground font-medium">Mensagens</span>
              <div className="flex gap-4 mt-1 text-sm">
                <span>📥 Cliente: <strong>{a.total_client_msgs}</strong></span>
                <span>📤 Equipe: <strong>{a.total_team_msgs}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Basic info */}
        <div className="space-y-3 mt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informações</h3>
          {basicItems.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
            >
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
