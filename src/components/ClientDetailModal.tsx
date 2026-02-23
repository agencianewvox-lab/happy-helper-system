import { Cliente } from "@/types/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ThumbsUp,
  Brain,
  ListTodo,
  Package,
  AlertTriangle,
  Clock,
  Lightbulb,
  TrendingDown,
  Star,
  Zap,
} from "lucide-react";

interface Props {
  cliente: Cliente | null;
  open: boolean;
  onClose: () => void;
}

const satisfacaoColor = {
  positivo: "text-emerald-400",
  neutro: "text-amber-400",
  negativo: "text-red-400",
};

const riscoColor = {
  baixo: "border-emerald-500/50 text-emerald-400",
  medio: "border-amber-500/50 text-amber-400 bg-amber-500/10",
  alto: "border-red-500/50 text-red-400 bg-red-500/10",
};

export function ClientDetailModal({ cliente, open, onClose }: Props) {
  if (!cliente) return null;

  const items = [
    { icon: ThumbsUp, label: "Satisfação", value: cliente.satisfacao, className: satisfacaoColor[cliente.satisfacao] },
    { icon: Brain, label: "Sentimento", value: cliente.sentimento },
    { icon: ListTodo, label: "Demandas", value: cliente.demandas },
    { icon: Package, label: "Entregas", value: cliente.entregas },
    { icon: AlertTriangle, label: "Falhas e Gargalos", value: cliente.falhas_gargalos },
    { icon: Clock, label: "Tempo Médio de Resposta", value: cliente.tempo_medio_resposta },
    { icon: Lightbulb, label: "Oportunidades", value: cliente.oportunidades },
    { icon: TrendingDown, label: "Risco de Churn", value: cliente.risco_churn, badge: true },
    { icon: Star, label: "Nota do Gestor", value: `${cliente.nota_gestor}/10` },
    { icon: Zap, label: "Ação Recomendada", value: cliente.acao_recomendada, highlight: true },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border/50 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{cliente.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {items.map(({ icon: Icon, label, value, className, badge, highlight }) => (
            <div
              key={label}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30",
                highlight && "bg-primary/5 border-primary/20"
              )}
            >
              <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                {badge ? (
                  <Badge className={cn("mt-1 text-xs", riscoColor[value as keyof typeof riscoColor])}>
                    {value}
                  </Badge>
                ) : (
                  <p className={cn("text-sm mt-0.5", className)}>{value}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
