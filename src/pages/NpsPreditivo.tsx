import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useClientData } from "@/hooks/useClientData";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { clientHealth, portfolioForUser } from "@/lib/client-health";
import { ClientHealthPanel } from "@/components/ClientHealth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";

export default function NpsPreditivo() {
  const { allGrupos, loading, error, hasMessageStats, messagesLoading } = useClientData();
  const { isAdmin, isMaster, gestorFilter, loading: profileLoading } = useProfile();
  const { signOut } = useAuth();
  const [search, setSearch] = useState("");
  const groups = useMemo(() => portfolioForUser(allGrupos, isMaster, gestorFilter).filter(g => g.nome.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (clientHealth(a).score ?? -1) - (clientHealth(b).score ?? -1)), [allGrupos, isMaster, gestorFilter, search]);
  return <SidebarProvider><div className="min-h-screen flex w-full bg-background"><DashboardSidebar isAdmin={isAdmin} isMaster={isMaster} onSignOut={signOut} /><main className="flex-1 min-w-0 p-5 md:p-9">
    <SidebarTrigger /><div className="mt-7 mb-8"><p className="text-[10px] uppercase tracking-[.2em] text-primary mb-3">GOVERNANÇA / RELACIONAMENTO</p><h1 className="text-3xl font-semibold">Saúde da carteira</h1><p className="text-muted-foreground text-sm mt-3 max-w-3xl">Uma fila de atenção operacional baseada em silêncio do grupo e atraso no retorno. Não é uma pesquisa de satisfação nem uma previsão de cancelamento.</p><Link to="/nps-real" className="inline-block text-sm text-primary mt-3 underline underline-offset-4">Ver satisfação informada pelos clientes →</Link></div>
    <Input aria-label="Buscar cliente" placeholder="Buscar cliente na sua carteira…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md mb-5" />
    {loading || profileLoading || (!hasMessageStats && messagesLoading) ? <p role="status" className="text-sm text-muted-foreground py-6">Carregando os sinais da carteira…</p> : error ? <p role="alert" className="text-destructive">Não foi possível carregar a carteira. Tente novamente.</p> : <><p className="text-xs text-muted-foreground mb-4">{groups.length} clientes · Prioridades primeiro · Sem pesquisa, não há NPS real.</p><div className="grid xl:grid-cols-2 gap-5">{groups.map(group => <article key={group.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold mb-1">{group.nome}</h2><p className="text-xs text-muted-foreground mb-4">{group.gestor_responsavel || "Gestor a definir"}</p><ClientHealthPanel group={group} /></article>)}</div>{!groups.length && <p className="py-10 text-muted-foreground">Nenhum cliente encontrado para este acesso e filtro.</p>}</>}
  </main></div></SidebarProvider>;
}
