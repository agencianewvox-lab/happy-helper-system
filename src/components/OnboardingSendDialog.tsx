import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { whatsappRequest, publicFormUrl } from "@/lib/whatsapp";



const MSG_CLINICA = `*NEW VOX | Boas-vindas à nossa parceria* ✨

Olá, Dr(a). [Nome do Responsável]! Tudo bem?

Vamos conhecer melhor sua clínica, seus serviços e seus objetivos para planejar os próximos passos da nossa parceria.

*Preencha seu onboarding pelo link abaixo:*
[Link do onboarding]

Você pode responder pelo celular, sem precisar de login.
Se surgir alguma dúvida, fale com nossa equipe aqui no grupo.

_Com cuidado em cada etapa, equipe New Vox._`;

const MSG_GENERICO = `*NEW VOX | Boas-vindas à nossa parceria* ✨

Olá, time! Tudo bem?

Vamos conhecer melhor sua empresa, seus produtos e serviços e seus objetivos para planejar os próximos passos da nossa parceria.

*Preencha seu onboarding pelo link abaixo:*
[Link do onboarding]

Você pode responder pelo celular, sem precisar de login.
Se surgir alguma dúvida, fale com nossa equipe aqui no grupo.

_Com cuidado em cada etapa, equipe New Vox._`;

interface Props {
  groupId: string;
  groupName: string;
  categoria: string | null;
  responsavelMaster?: string | null;
}

export function OnboardingSendDialog({ groupId, groupName, categoria, responsavelMaster }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const isClinica = categoria?.toLowerCase().includes("clínica") || categoria?.toLowerCase().includes("odonto");
  const surveyType = isClinica ? "clinica" : "generico";
  const onboardingLink = publicFormUrl(`/onboardingnv/${encodeURIComponent(groupId)}/${surveyType}`);

  const buildMessage = () => {
    const template = isClinica ? MSG_CLINICA : MSG_GENERICO;
    return template
      .replace(/\[Nome do Responsável\]/g, responsavelMaster || "Responsável")
      .replace(/\[Link do onboarding\]/g, onboardingLink);
  };

  const [message, setMessage] = useState(buildMessage());

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setMessage(buildMessage());
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
          <ClipboardList className="w-3.5 h-3.5" />
          Onboarding
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar Onboarding — {groupName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Edite a mensagem abaixo se necessário antes de enviar.</p>
          <Textarea aria-label="Mensagem que será enviada ao grupo" value={message} onChange={(e) => setMessage(e.target.value)} rows={10} className="text-sm" />
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
