import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Users, Phone } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  is_master: boolean;
  telefone: string | null;
}

export function EquipeManager() {
  const { canManageTeam } = useProfile();
  const [roleEdits, setRoleEdits] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "social_media",
  });
  const [submitting, setSubmitting] = useState(false);
  const createPerson = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageTeam) return;
    if (
      form.role === "admin" &&
      !window.confirm(
        "Criar ADM? Essa pessoa poderá acessar todos os clientes, conversas, contratado, cofre de acessos, anúncios, relatórios, Social Media e reuniões. Não será Master e não poderá criar usuários ou alterar perfis.",
      )
    )
      return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-team-users",
        { body: form },
      );
      if (error || !data?.ok)
        throw new Error(
          data?.error ||
            "Não foi possível criar o acesso. Confira o e-mail e a senha.",
        );
      setForm({ name: "", email: "", password: "", role: "social_media" });
      setCreating(false);
      toast.success(
        form.role === "admin"
          ? "ADM criado com acesso à carteira completa. Nenhum vínculo individual é necessário."
          : form.role === "gestor"
            ? "Gestor criado. Atribua os clientes na ficha de cada cliente."
            : "Acesso criado. Agora atribua os clientes em Social Media → Equipe.",
      );
      await fetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao cadastrar.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_master, telefone")
      .order("is_master", { ascending: false })
      .order("full_name");
    if (error) toast.error("Erro ao carregar equipe: " + error.message);
    else setProfiles((data || []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canManageTeam) void fetch();
  }, [canManageTeam, fetch]);

  const sanitize = (val: string) => val.replace(/\D/g, "");
  const saveRole = async (p: Profile) => {
    const role = roleEdits[p.id];
    if (!canManageTeam || p.is_master || !role || role === p.role) return;
    const detail =
      role === "admin"
        ? "Terá acesso aos dados de TODA a carteira, incluindo conversas e cofre de acessos."
        : "O acesso global de ADM será removido, caso exista. Valerão os clientes e permissões do perfil escolhido.";
    if (
      !window.confirm(
        `Alterar o perfil de ${p.full_name} para ${role === "admin" ? "ADM" : role === "gestor" ? "Gestor" : "Social Media"}? ${detail} Sessões da extensão deverão ser autorizadas novamente.`,
      )
    )
      return;
    setSavingId(p.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-team-users",
        {
          body: {
            action: "update_role",
            profileId: p.id,
            role,
            expectedRole: p.role,
          },
        },
      );
      if (error || !data?.ok)
        throw new Error(
          data?.error ||
            "Não foi possível alterar. Atualize a lista e tente novamente.",
        );
      setRoleEdits((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      toast.success(
        "Perfil atualizado. Peça à pessoa para recarregar o painel.",
      );
      await fetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao alterar perfil.",
      );
    } finally {
      setSavingId(null);
    }
  };

  const save = async (p: Profile) => {
    const raw = edits[p.id];
    if (raw === undefined) return;
    const clean = sanitize(raw);
    if (clean && (clean.length < 10 || clean.length > 15)) {
      toast.error(
        "Número inválido. Use formato internacional (DDI+DDD+número).",
      );
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
      setProfiles((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, telefone: clean || null } : x,
        ),
      );
      setEdits((prev) => {
        const n = { ...prev };
        delete n[p.id];
        return n;
      });
    }
    setSavingId(null);
  };

  if (!canManageTeam)
    return (
      <p role="alert">
        Somente o Master pode administrar os acessos da equipe.
      </p>
    );
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
        <div>
          <h2 className="text-lg font-semibold">Equipe e acessos</h2>
          <p className="text-sm text-muted-foreground">
            Defina o perfil: ADM acessa toda a carteira; gestores e Social Media
            recebem clientes específicos.
          </p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          {creating ? "Cancelar" : "Adicionar pessoa"}
        </Button>
      </div>
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo acesso à equipe</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createPerson} className="space-y-4">
              <label className="block text-sm">
                Nome completo
                <Input
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                E-mail de acesso
                <Input
                  required
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Senha inicial
                <Input
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  Mínimo de 12 caracteres. Compartilhe por um canal seguro; a
                  pessoa pode trocar em Minha conta.
                </span>
              </label>
              <label className="block text-sm">
                Perfil
                <select
                  className="mt-1 block h-10 w-full rounded-md border bg-background px-3"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="social_media">
                    Social Media — apenas área social e Minha conta
                  </option>
                  <option value="gestor">
                    Gestor — operação da própria carteira
                  </option>
                  <option value="admin">
                    ADM — visão e operação de toda a carteira
                  </option>
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                {form.role === "admin"
                  ? "ADM acessa todos os clientes e informações operacionais, incluindo conversas e cofre de acessos. O Master continua responsável por criar usuários e alterar permissões."
                  : form.role === "gestor"
                    ? "Atribua os clientes ao gestor na ficha de cada cliente. Sem atribuição, a carteira ficará vazia."
                    : "Nenhum cliente é liberado automaticamente. Em Social Media → Equipe, atribua clientes e permissões de aprovação, conexão e publicação."}{" "}
                Não é enviado convite por e-mail.
              </p>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Criando acesso…" : "Criar acesso"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Button
        variant="outline"
        onClick={() => {
          window.location.href = "/social?aba=team";
        }}
      >
        Definir clientes e permissões da Social Media
      </Button>
      <div className="text-xs text-muted-foreground mb-2">
        Cadastre o telefone no formato internacional (só dígitos):{" "}
        <span className="font-mono">DDI + DDD + número</span> — ex:{" "}
        <span className="font-mono">5564992565779</span>. Este número é usado
        pela Evolution API para envio de notificações (NPS, onboarding,
        briefing, feedback).
      </div>
      {profiles.map((p) => {
        const current = edits[p.id] ?? (p.telefone || "");
        const changed =
          edits[p.id] !== undefined &&
          sanitize(edits[p.id]) !== (p.telefone || "");
        return (
          <Card key={p.id} className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {p.full_name}
                {p.is_master && (
                  <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px]">
                    MASTER
                  </Badge>
                )}
                {!p.is_master && (
                  <Badge variant="outline" className="text-[10px]">
                    {p.role === "social_media"
                      ? "Social Media"
                      : p.role === "admin"
                        ? "ADM · todos os clientes"
                        : "Gestor"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!p.is_master && (
                <div className="mb-4 flex flex-wrap items-end gap-2">
                  <label className="flex-1 text-xs">
                    Perfil de acesso de {p.full_name}
                    <select
                      className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm"
                      disabled={savingId === p.id}
                      value={roleEdits[p.id] || p.role}
                      onChange={(e) =>
                        setRoleEdits((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="gestor">
                        Gestor — carteira atribuída
                      </option>
                      <option value="social_media">
                        Social Media — clientes atribuídos
                      </option>
                      <option value="admin">ADM — toda a carteira</option>
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !!savingId ||
                      !roleEdits[p.id] ||
                      roleEdits[p.id] === p.role
                    }
                    onClick={() => void saveRole(p)}
                  >
                    {savingId === p.id ? "Salvando…" : "Alterar perfil"}
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <Input
                  value={current}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
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
                <p className="text-[11px] text-amber-500/80 mt-2">
                  ⚠ Sem telefone cadastrado — não receberá notificações via
                  WhatsApp.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
