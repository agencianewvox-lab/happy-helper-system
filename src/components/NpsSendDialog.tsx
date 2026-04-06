import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_URL = "https://bot-n8n.1lxz8u.easypanel.host/webhook/03f12fb5-48ed-4f30-8aaa-02a8912768e3";
const PUBLISHED_APP_URL = "https://happy-helper-system.lovable.app";

const MSG_OPERACAO = `Olá, [Nome]! Tudo bem?
Aqui é da equipe da [Nome da Agência]. Trabalhamos todos os dias para entregar os melhores resultados para o seu negócio, e a sua opinião é fundamental para continuarmos evoluindo.
Preparamos uma pesquisa rápida (leva menos de 2 minutos) para entender como está sendo a sua experiência conosco.
👉 [Link da pesquisa]
Sua resposta é muito importante para nós. Contamos com você!
Um abraço,
Equipe [Nome da Agência]`;

const MSG_CLINICA = `Olá, Dr(a). [Nome]! Tudo bem?
Aqui é da equipe da [Nome da Agência]. É muito importante para nós saber como está sendo a sua experiência com as estratégias de marketing que desenvolvemos para a sua clínica.
Preparamos uma pesquisa rápida (menos de 2 minutos) para ouvir a sua opinião e continuar entregando resultados cada vez melhores para o seu consultório.
👉 [Link da pesquisa]
Sua avaliação nos ajuda a evoluir. Contamos com você!
Um abraço,
Equipe [Nome da Agência]`;

interface Props {
  groupId: string;
  groupName: string;
  categoria: string | null;
}

export function NpsSendDialog({ groupId, groupName, categoria }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const isClinica = categoria?.toLowerCase() === "clínicas";
  const surveyType = isClinica ? "clinica" : "operacao";
  const surveyLink = `${PUBLISHED_APP_URL}/pesquisa-nps/${encodeURIComponent(groupId)}/${surveyType}`;

  const defaultMsg = (isClinica ? MSG_CLINICA : MSG_OPERACAO)
    .replace(/\[Link da pesquisa\]/g, surveyLink);

  const [message, setMessage] = useState(defaultMsg);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      const msg = (isClinica ? MSG_CLINICA : MSG_OPERACAO)
        .replace(/\[Link da pesquisa\]/g, surveyLink);
      setMessage(msg);
    }
    setOpen(isOpen);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          message,
        }),
      });
      if (!res.ok) throw new Error("Erro ao enviar");
      toast.success(`Pesquisa NPS enviada para ${groupName}!`);
      setOpen(false);
    } catch {
      toast.error("Falha ao enviar o webhook. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Send className="w-3.5 h-3.5" />
          Enviar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar Pesquisa NPS — {groupName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Edite a mensagem abaixo se necessário antes de enviar.
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            className="text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
