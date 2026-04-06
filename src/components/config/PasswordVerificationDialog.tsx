import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  label: string;
}

export function PasswordVerificationDialog({ open, onClose, onConfirm, label }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!password.trim()) return;
    setLoading(true);

    const { data } = await supabase
      .from("system_configs")
      .select("config_value")
      .eq("config_key", "master_config_password")
      .single();

    if (data?.config_value === password) {
      toast.success("Senha verificada!");
      setPassword("");
      onConfirm();
    } else {
      toast.error("Senha incorreta. Tente novamente.");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPassword(""); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-amber-500" />
            Verificação de Segurança
          </DialogTitle>
          <DialogDescription className="text-xs">
            Digite a senha master para confirmar a alteração: <strong>{label}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="password"
              placeholder="Senha Master"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              className="pl-9 text-sm"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setPassword(""); onClose(); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleVerify} disabled={!password.trim() || loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
