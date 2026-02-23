import { Cliente } from "@/types/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Clock, Star, AlertTriangle } from "lucide-react";

interface ClientCardProps {
  cliente: Cliente;
  onClick: (cliente: Cliente) => void;
  compact?: boolean;
}

const satisfacaoConfig = {
  positivo: { color: "bg-emerald-500", text: "text-emerald-400", label: "Positivo" },
  neutro: { color: "bg-amber-500", text: "text-amber-400", label: "Neutro" },
  negativo: { color: "bg-red-500", text: "text-red-400", label: "Negativo" },
};

const riscoConfig = {
  baixo: { variant: "outline" as const, className: "border-emerald-500/50 text-emerald-400" },
  medio: { variant: "outline" as const, className: "border-amber-500/50 text-amber-400 bg-amber-500/10" },
  alto: { variant: "outline" as const, className: "border-red-500/50 text-red-400 bg-red-500/10 animate-pulse" },
};

function isAlerta(cliente: Cliente) {
  return cliente.conversas_iniciadas === 0 || cliente.risco_churn === "medio" || cliente.risco_churn === "alto";
}

export function ClientCard({ cliente, onClick, compact }: ClientCardProps) {
  const alerta = isAlerta(cliente);
  const sat = satisfacaoConfig[cliente.satisfacao];
  const risco = riscoConfig[cliente.risco_churn];

  return (
    <Card
      onClick={() => onClick(cliente)}
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-[1.02] border-2",
        "bg-card/80 backdrop-blur-sm",
        alerta
          ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
          : "border-border/50 hover:border-primary/30",
        compact && "text-sm"
      )}
    >
      <CardHeader className={cn("pb-2", compact ? "p-3" : "p-4")}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={cn("truncate", compact ? "text-sm" : "text-base")}>
            {cliente.nome}
          </CardTitle>
          <div className={cn("w-3 h-3 rounded-full shrink-0", sat.color)} />
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-2", compact ? "p-3 pt-0" : "p-4 pt-0")}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className={cn("font-medium", sat.text)}>{sat.label}</span>
          <span className="truncate ml-2 max-w-[120px]">{cliente.sentimento}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={cn(cliente.conversas_iniciadas === 0 && "text-red-400 font-bold")}>
              {cliente.conversas_iniciadas} conversas
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{cliente.tempo_medio_resposta}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">{cliente.nota_gestor}/10</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
            <Badge className={cn("text-[10px] px-1.5 py-0", risco.className)}>
              {cliente.risco_churn}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
