import { Grupo } from "@/types/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock, Hash, FolderOpen } from "lucide-react";

interface Props {
  grupo: Grupo | null;
  open: boolean;
  onClose: () => void;
}

export function ClientDetailModal({ grupo, open, onClose }: Props) {
  if (!grupo) return null;

  const items = [
    { icon: FolderOpen, label: "Categoria", value: grupo.categoria || "Sem categoria" },
    { icon: Hash, label: "Group ID", value: grupo.group_id },
    { icon: MessageSquare, label: "Total de Mensagens", value: String(grupo.total_mensagens) },
    { icon: Clock, label: "Última Atividade", value: grupo.ultimo_horario ? new Date(grupo.ultimo_horario).toLocaleString("pt-BR") : "Sem atividade" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border/50 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{grupo.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {items.map(({ icon: Icon, label, value }) => (
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
