import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PUBLISHED_APP_URL = "https://paineldecontrolenv.lovable.app";

const MSG_CLINICA = `Olá, Dr(a). [Nome do Responsável]! Tudo bem?

Aqui é da equipe da New Vox! Para iniciarmos os trabalhos de marketing da sua clínica com máxima eficiência, preparamos um formulário de onboarding rápido para conhecer melhor o seu negócio.

👉 [Link do onboarding]

Leva poucos minutos e nos ajuda a criar estratégias sob medida para você!

Um abraço,
Equipe New Vox 🚀`;

const MSG_GENERICO = `Olá, Time! Tudo bem?

Para iniciarmos os trabalhos com o máximo de assertividade, preparamos um formulário de onboarding para entendermos melhor o seu negócio.

👉 [Link do onboarding]

Leva poucos minutos e faz toda a diferença!

Equipe New Vox 🚀`;

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
  const onboardingLink = `${PUBLISHED_APP_URL}/onboardingnv/${encodeURIComponent(groupId)}/${surveyType}`;

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
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-nps-webhook", {
        body: { group_id: groupId, message },
      });
      if (error) throw error;
      toast.success(`Onboarding enviado para ${groupName}!`);
      setOpen(false);
    } catch {
      toast.error("Falha ao enviar. Tente novamente.");
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
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={10} className="text-sm" />
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
