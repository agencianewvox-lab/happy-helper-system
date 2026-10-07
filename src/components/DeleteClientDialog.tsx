import { useId, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  clientName: string;
  onConfirm: () => Promise<void>;
}

/** Mount with the client ID as key so confirmation never transfers to another card. */
export function DeleteClientDialog({ clientName, onConfirm }: Props) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function changeOpen(next: boolean) {
    if (inFlight.current) return;
    setConfirmation("");
    setError(null);
    setOpen(next);
  }

  async function confirmDeletion() {
    if (!open || confirmation !== "EXCLUIR" || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
      setConfirmation("");
    } catch {
      setConfirmation("");
      setError("Não foi possível concluir a exclusão. Alguns registros podem ter sido removidos. Atualize o painel e confira o cliente antes de tentar novamente.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Excluir cliente"
          title="Excluir cliente" className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={(event) => event.stopPropagation()}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-xl" aria-busy={pending}
        onEscapeKeyDown={(event) => { if (inFlight.current) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja excluir este cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            Você está prestes a excluir <strong className="font-semibold text-foreground">{clientName}</strong>.
            {" "}O cadastro, as conversas, o onboarding, as notas, as tarefas e os indicadores relacionados
            serão apagados permanentemente. Esta ação não pode ser desfeita pelo painel.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Digite EXCLUIR para confirmar</Label>
          <Input id={inputId} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending} autoComplete="off" spellCheck={false} placeholder="EXCLUIR" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar, manter cliente</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={confirmation !== "EXCLUIR" || pending}
            onClick={confirmDeletion}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {pending ? "Excluindo…" : "Excluir definitivamente"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
