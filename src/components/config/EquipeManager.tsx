import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Users, Phone } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  is_master: boolean;
  telefone: string | null;
}

export function EquipeManager() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_master, telefone")
      .order("is_master", { ascending: false })
      .order("full_name");
    if (error) toast.error("Erro ao carregar equipe: " + error.message);
    else setProfiles((data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const sanitize = (val: string) => val.replace(/\D/g, "");

  const save = async (p: Profile) => {
    const raw = edits[p.id];
    if (raw === undefined) return;
    const clean = sanitize(raw);
    if (clean && (clean.length < 10 || clean.length > 15)) {
      toast.error("Número inválido. Use formato internacional (DDI+DDD+número).");
      return;
    }
    setSavingId(p.id);
    const { error } = await supabase
      .from("profiles")
      .update({ telefone: clean || null })
      .eq("id", p.id);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(`Telefone de ${p.full_name} atualizado.`);
      setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, telefone: clean || null } : x));
      setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    }
    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground mb-2">
        Cadastre o telefone no formato internacional (só dígitos): <span className="font-mono">DDI + DDD + número</span> — ex: <span className="font-mono">5564992565779</span>. Este número é usado pela Evolution API para envio de notificações (NPS, onboarding, briefing, feedback).
      </div>
      {profiles.map(p => {
        const current = edits[p.id] ?? (p.telefone || "");
        const changed = edits[p.id] !== undefined && sanitize(edits[p.id]) !== (p.telefone || "");
        return (
          <Card key={p.id} className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {p.full_name}
                {p.is_master && (
                  <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px]">MASTER</Badge>
                )}
                <Badge variant="outline" className="text-[10px] capitalize">{p.role}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <Input
                  value={current}
                  onChange={e => setEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="Ex: 5564992565779"
                  className="font-mono text-sm h-9"
                />
                <Button
                  size="sm"
                  disabled={!changed || savingId === p.id}
                  onClick={() => save(p)}
                  className="gap-1.5 h-9"
                >
                  {savingId === p.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
              {!p.telefone && (
                <p className="text-[11px] text-amber-500/80 mt-2">⚠ Sem telefone cadastrado — não receberá notificações via WhatsApp.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
