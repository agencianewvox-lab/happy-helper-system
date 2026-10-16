import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clientWorkspace } from "@/lib/client-workspace";
import { useAuth } from "@/hooks/useAuth";

export function ArchivedClients() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["archived-clients", user?.id],
    enabled: open,
    queryFn: () =>
      clientWorkspace<{ id: string; name: string; archivedAt: string }[]>(
        "archives",
      ),
  });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArchiveRestore className="mr-2 h-4 w-4" />
        Arquivados
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clientes arquivados</DialogTitle>
            <DialogDescription>
              Histórico preservado. Restaure o cadastro para voltar a trabalhar
              com este cliente; revise os relatórios antes de ativá-los.
            </DialogDescription>
          </DialogHeader>
          {query.isLoading && <p role="status">Carregando…</p>}
          {query.isError && (
            <div role="alert">
              <p>{query.error.message}</p>
              <Button onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
          <div className="max-h-[60dvh] space-y-3 overflow-y-auto">
            {query.data?.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.archivedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(c.id);
                    try {
                      const result = await clientWorkspace<{ ok: boolean }>(
                        "restore",
                        c.id,
                      );
                      if (!result?.ok)
                        throw new Error("Restauração não confirmada.");
                      await query.refetch();
                      toast.success(
                        "Cliente restaurado. Revise a agenda de relatórios.",
                      );
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === c.id ? "Restaurando…" : "Restaurar"}
                </Button>
              </div>
            ))}
          </div>
          {query.data?.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum cliente arquivado.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
