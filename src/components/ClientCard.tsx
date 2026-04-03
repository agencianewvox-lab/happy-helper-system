import { useState, useEffect } from "react";
import { Grupo } from "@/types/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus, AlertCircle, PhoneOff, DollarSign, CalendarDays } from "lucide-react";

interface ClientCardProps {
  grupo: Grupo;
  onClick: (grupo: Grupo) => void;
  compact?: boolean;
}

const categoriaConfig: Record<string, { color: string; icon: string }> = {
  "Clientes / Operação": { color: "bg-blue-500", icon: "🚗" },
  "Clínicas": { color: "bg-emerald-500", icon: "🦷" },
  "Internos / Gestão": { color: "bg-purple-500", icon: "🧠" },
};

const intentConfig: Record<string, { emoji: string; color: string; bg: string }> = {
  "Aprovação": { emoji: "🎨", color: "text-violet-500", bg: "bg-violet-500/10" },
  "Suporte Técnico": { emoji: "🔧", color: "text-blue-500", bg: "bg-blue-500/10" },
  "Financeiro": { emoji: "💰", color: "text-amber-500", bg: "bg-amber-500/10" },
  "Urgência": { emoji: "🚨", color: "text-red-500", bg: "bg-red-500/10" },
  "Informativo": { emoji: "💬", color: "text-muted-foreground", bg: "bg-muted" },
};

const sentimentConfig = {
  positivo: { icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Positivo" },
  neutro: { icon: Minus, color: "text-amber-500", bg: "bg-amber-500/10", label: "Neutro" },
  negativo: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10", label: "Negativo" },
};

function formatFrt(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function churnColor(risk: number): string {
  if (risk >= 70) return "text-red-500";
  if (risk >= 40) return "text-amber-500";
  return "text-emerald-500";
}

function churnBg(risk: number): string {
  if (risk >= 70) return "bg-red-500/10";
  if (risk >= 40) return "bg-amber-500/10";
  return "bg-emerald-500/10";
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function ClientCard({ grupo, onClick, compact }: ClientCardProps) {
  const catConfig = categoriaConfig[grupo.categoria || ""] || { color: "bg-muted", icon: "📁" };
  const temMensagens = grupo.total_mensagens > 0;
  const a = grupo.analytics;
  const sent = a ? sentimentConfig[a.sentiment] : null;
  const SentIcon = sent?.icon || Minus;

  // Live tick for SLA timer
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!grupo.sla_violated) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [grupo.sla_violated]);

  return (
    <Card
      onClick={() => onClick(grupo)}
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-[1.02] border-2",
        "bg-card/80 backdrop-blur-sm",
        grupo.sla_violated
          ? "border-red-500/60 ring-1 ring-red-500/20 shadow-red-500/10 shadow-lg"
          : temMensagens
            ? "border-border/50 hover:border-primary/30"
            : "border-border/20 opacity-70 hover:opacity-100",
        compact && "text-sm"
      )}
    >
      <CardHeader className={cn("pb-2", compact ? "p-3" : "p-4")}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={cn("truncate", compact ? "text-sm" : "text-base")}>
            <span className="mr-1.5">{catConfig.icon}</span>
            {grupo.nome}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {a && a.churn_risk >= 60 && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            )}
            <div className={cn("w-3 h-3 rounded-full shrink-0", catConfig.color)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-2", compact ? "p-3 pt-0" : "p-4 pt-0")}>
        {/* SLA Violation Banner */}
        {grupo.sla_violated && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500 bg-red-500/10 rounded px-2 py-1 border border-red-500/20 animate-pulse">
            <PhoneOff className="w-3.5 h-3.5 shrink-0" />
            <span>Silêncio da Equipe — {formatDelay(grupo.sla_delay_minutes + 30)} sem resposta</span>
          </div>
        )}

        {grupo.categoria && (
          <Badge variant="secondary" className="text-[10px]">
            {grupo.categoria}
          </Badge>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={cn(!temMensagens && "text-muted-foreground")}>
              {grupo.total_mensagens} msg
            </span>
          </div>
          {grupo.ultimo_horario && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="truncate">
                {new Date(grupo.ultimo_horario).toLocaleDateString("pt-BR")}
              </span>
            </div>
          )}
          {grupo.investimento_ads != null && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-medium">
                R$ {grupo.investimento_ads.toLocaleString("pt-BR")}
              </span>
            </div>
          )}
          {grupo.data_ciclo_ads && (
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-500" />
              <span className="truncate" title="Data de Ciclo de Ads">
                Ciclo: {new Date(grupo.data_ciclo_ads).toLocaleDateString("pt-BR")}
              </span>
            </div>
          )}
        </div>

        {/* Analytics badges */}
        {a && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {/* Sentiment */}
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full", sent?.bg, sent?.color)}>
              <SentIcon className="w-3 h-3" />
              {sent?.label}
            </span>
            {/* FRT */}
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              ⏱ {formatFrt(a.avg_frt_minutes)}
            </span>
            {/* Churn */}
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full", churnBg(a.churn_risk), churnColor(a.churn_risk))}>
              🔥 {a.churn_risk}%
            </span>
            {/* Pending */}
            {a.has_pending_demands && (() => {
              const details = a.pending_demand_details || [];
              const urgentes = details.filter(d => d.category === "confirmada" && d.priority === "urgente");
              const normais = details.filter(d => d.category === "confirmada" && d.priority !== "urgente");
              const possiveis = details.filter(d => d.category === "possivel");
              return (
                <>
                  {urgentes.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500">
                      <AlertCircle className="w-3 h-3" />
                      {urgentes.length} Urgente{urgentes.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {normais.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500">
                      <AlertCircle className="w-3 h-3" />
                      {normais.length} Pendente{normais.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {possiveis.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                      <AlertCircle className="w-3 h-3" />
                      {possiveis.length} Possível
                    </span>
                  )}
                </>
              );
            })()}
            {/* Intent */}
            {a.intent && intentConfig[a.intent] && (
              <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full", intentConfig[a.intent].bg, intentConfig[a.intent].color)}>
                {intentConfig[a.intent].emoji} {a.intent}
              </span>
            )}
          </div>
        )}

        {/* Motivo pendência resumido + solução */}
        {a?.has_pending_demands && !compact && (
          <div className="space-y-1">
            {(a.pending_demand_details || []).slice(0, 2).map((d, i) => {
              const isPossivel = d.category === "possivel" || d.confidence === "media";
              const isUrgente = d.priority === "urgente" && !isPossivel;
              return (
                <div
                  key={i}
                  className={cn(
                    "text-[10px] rounded px-2 py-1 space-y-0.5",
                    isPossivel
                      ? "text-muted-foreground bg-muted/30 border border-dashed border-muted-foreground/30"
                      : isUrgente
                        ? "text-red-400 bg-red-500/5 border border-red-500/20"
                        : "text-orange-400 bg-orange-500/5 border border-orange-500/20"
                  )}
                >
                  <div>
                    <span className="font-semibold">
                      {isPossivel ? "Possível: " : isUrgente ? "🔴 Urgente: " : "Pendência: "}
                    </span>
                    {d.message_excerpt ? `"${d.message_excerpt.slice(0, 80)}"` : d.term}
                    {d.hours_waiting > 0 && <span className="ml-1 opacity-70">({d.hours_waiting}h)</span>}
                  </div>
                  {d.suggested_solution && !isPossivel && (
                    <div className="text-emerald-400">
                      <span className="font-semibold">Ação: </span>
                      {d.suggested_solution}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {grupo.ultima_mensagem && !compact && (
          <p className="text-xs text-muted-foreground truncate italic">
            "{grupo.ultima_mensagem}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}
