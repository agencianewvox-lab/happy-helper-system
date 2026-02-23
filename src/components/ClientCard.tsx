import { Grupo } from "@/types/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Clock, Users } from "lucide-react";

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

export function ClientCard({ grupo, onClick, compact }: ClientCardProps) {
  const catConfig = categoriaConfig[grupo.categoria || ""] || { color: "bg-muted", icon: "📁" };
  const temMensagens = grupo.total_mensagens > 0;

  return (
    <Card
      onClick={() => onClick(grupo)}
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-[1.02] border-2",
        "bg-card/80 backdrop-blur-sm",
        temMensagens
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
          <div className={cn("w-3 h-3 rounded-full shrink-0", catConfig.color)} />
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-2", compact ? "p-3 pt-0" : "p-4 pt-0")}>
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
        </div>

        {grupo.ultima_mensagem && (
          <p className="text-xs text-muted-foreground truncate italic">
            "{grupo.ultima_mensagem}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}
