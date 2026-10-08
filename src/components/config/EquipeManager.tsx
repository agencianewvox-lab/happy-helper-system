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
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "social_media" });
  const [submitting, setSubmitting] = useState(false);
  const createPerson = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-team-users", { body: form });
      if (error || !data?.ok) throw new Error(data?.error || "Não foi possível criar o acesso. Confira o e-mail e a senha.");
      setForm({ name: "", email: "", password: "", role: "social_media" });
      setCreating(false);
      toast.success("Acesso criado. Agora atribua os clientes em Social Media → Equipe.");
      await fetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao cadastrar."); }
    finally { setSubmitting(false); }
  };
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Equipe e acessos</h2><p className="text-sm text-muted-foreground">Cadastre a pessoa e depois escolha os clientes que ela poderá gerenciar.</p></div>
        <Button onClick={() => setCreating(value => !value)}>{creating ? "Cancelar" : "Adicionar pessoa"}</Button>
      </div>
      {creating && <Card><CardHeader><CardTitle className="text-base">Novo acesso à equipe</CardTitle></CardHeader><CardContent>
        <form onSubmit={createPerson} className="space-y-4">
          <label className="block text-sm">Nome completo<Input required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block text-sm">E-mail de acesso<Input required type="email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label className="block text-sm">Senha inicial<Input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><span className="text-xs text-muted-foreground">Mínimo de 12 caracteres. Compartilhe por um canal seguro; a pessoa pode trocar em Minha conta.</span></label>
          <label className="block text-sm">Perfil<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="social_media">Social Media — apenas área social e Minha conta</option><option value="gestor">Gestor — operação da própria carteira</option></select></label>
          <p className="text-xs text-muted-foreground">Nenhum cliente é liberado automaticamente. Para a área social, selecione a pessoa em Social Media → Equipe, atribua cada cliente e escolha se ela pode aprovar, conectar e publicar. Não é enviado convite por e-mail.</p>
          <Button type="submit" disabled={submitting}>{submitting ? "Criando acesso…" : "Criar acesso"}</Button>
        </form>
      </CardContent></Card>}
      <Button variant="outline" onClick={() => { window.location.href = "/social?aba=team"; }}>Definir clientes e permissões da Social Media</Button>
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
                <Badge variant="outline" className="text-[10px] capitalize">{p.role === "social_media" ? "Social Media" : p.role}</Badge>
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
