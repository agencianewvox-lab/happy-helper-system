import { Grupo } from "@/types/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Clock, Hash, FolderOpen,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Timer, ThumbsUp, ThumbsDown, Users, ShieldAlert,
} from "lucide-react";

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
  if (!grupo) return null;

  const a = grupo.analytics;
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
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
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

            {/* Pending Demands - Motivo Pendência */}
            {a.has_pending_demands && (
              <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-orange-500 uppercase tracking-wider">Motivo Pendência</span>
                </div>
                {a.pending_demand_terms.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Cliente aguardando resposta sobre:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {a.pending_demand_terms.map((term) => (
                        <Badge key={term} variant="outline" className="text-[10px] border-orange-500/30 text-orange-400">
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Cliente enviou mensagem há mais de 2 horas sem resposta da equipe.
                  </p>
                )}
              </div>
            )}

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
