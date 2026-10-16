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
    if (!open || confirmation !== "ARQUIVAR" || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
      setConfirmation("");
    } catch {
      setConfirmation("");
      setError("Não foi possível confirmar o arquivamento. Nenhum histórico foi apagado. Atualize e confira antes de tentar novamente.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Arquivar cliente"
          title="Arquivar cliente" className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={(event) => event.stopPropagation()}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-xl" aria-busy={pending}
        onEscapeKeyDown={(event) => { if (inFlight.current) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja arquivar este cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            Você está prestes a arquivar <strong className="font-semibold text-foreground">{clientName}</strong>.
            {" "}O cliente sairá da carteira ativa e não receberá novos relatórios. Conversas, onboarding, notas e histórico serão preservados. O Master poderá restaurá-lo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Digite ARQUIVAR para confirmar</Label>
          <Input id={inputId} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending} autoComplete="off" spellCheck={false} placeholder="ARQUIVAR" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar, manter cliente</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={confirmation !== "ARQUIVAR" || pending}
            onClick={confirmDeletion}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {pending ? "Arquivando…" : "Arquivar cliente"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
