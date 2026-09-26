import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { whatsappRequest, publicFormUrl } from "@/lib/whatsapp";


const MSG_OPERACAO = `*NEW VOX | Sua opinião faz a diferença* 💬

Olá, time! Tudo bem?

Queremos saber como está sendo sua experiência com a New Vox. Sua avaliação nos ajuda a cuidar melhor do seu negócio.

*Responda à pesquisa pelo link abaixo:*
[Link da pesquisa]

É simples e não precisa de login.

_Obrigado por construir essa parceria com a gente. Equipe New Vox._`;

const MSG_CLINICA = `*NEW VOX | Sua opinião faz a diferença* 💬

Olá, Dr(a). [Nome do Responsável Master]! Tudo bem?

Queremos saber como está sendo sua experiência com a New Vox. Sua avaliação nos ajuda a cuidar melhor da estratégia da sua clínica.

*Responda à pesquisa pelo link abaixo:*
[Link da pesquisa]

É simples e não precisa de login.

_Obrigado por construir essa parceria com a gente. Equipe New Vox._`;

interface Props {
  groupId: string;
  groupName: string;
  categoria: string | null;
  responsavelMaster?: string | null;
}

export function NpsSendDialog({ groupId, groupName, categoria, responsavelMaster }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const isClinica = categoria?.toLowerCase() === "clínicas";
  const surveyType = isClinica ? "clinica" : "operacao";
  const surveyLink = publicFormUrl(`/pesquisa-nps/${encodeURIComponent(groupId)}/${surveyType}`);

  const buildMessage = () => {
    if (isClinica) {
      return MSG_CLINICA
        .replace(/\[Nome do Responsável Master\]/g, responsavelMaster || "Responsável")
        .replace(/\[Link da pesquisa\]/g, surveyLink);
    }
    return MSG_OPERACAO.replace(/\[Link da pesquisa\]/g, surveyLink);
  };

  const [message, setMessage] = useState(buildMessage());

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setMessage(buildMessage());
    }
    setOpen(isOpen);
  };

  const handleSend = async () => {
    if (sending || !message.trim()) return;
    setSending(true);
    try {
      const result = await whatsappRequest<{ accepted: boolean; messageId: string }>({ group_id: groupId, message });
      if (!result.accepted || !result.messageId) throw new Error("A Evolution não confirmou o envio.");
      toast.success("Mensagem aceita pela Evolution. Confira a entrega no WhatsApp.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao confirmar envio. Confira o WhatsApp antes de repetir.");
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
            aria-label="Mensagem da pesquisa que será enviada ao grupo"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">Link no domínio paineldecontrole.newvox.site, com capa New Vox. A exibição da prévia depende do WhatsApp.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()} className="gap-1.5">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
