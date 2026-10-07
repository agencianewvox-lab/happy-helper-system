import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { MetaAdsTab } from "@/components/MetaAdsTab";
import { Input } from "@/components/ui/input";

export default function Anuncios() {
  const { isAdmin, isMaster, gestorFilter, profile, loading } = useProfile();
  const { signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["ads-portfolio", profile?.user_id, isMaster, gestorFilter],
    enabled: !loading && Boolean(profile),
    queryFn: async () => {
      if (!isMaster && !gestorFilter) return [];
      let request = supabase.from("whatsapp_grupos").select("id,group_id,nome,gestor_responsavel,ad_account_id").order("nome");
      if (!isMaster) request = request.eq("gestor_responsavel", gestorFilter!);
      const { data, error } = await request;
      if (error) throw error;
      return data;
    },
  });
  const groups = query.data || [];
  const client = groups.find(g => g.id === selected);
  const filtered = groups.filter(g => g.nome.toLowerCase().includes(search.toLowerCase()));
  return <SidebarProvider><div className="min-h-screen flex w-full bg-background"><DashboardSidebar isAdmin={isAdmin} isMaster={isMaster} onSignOut={signOut} /><main className="flex-1 min-w-0 p-5 md:p-9">
    <SidebarTrigger /><div className="mt-7 mb-8"><p className="text-[10px] uppercase tracking-[.2em] text-primary mb-3">OPERAÇÃO / MÍDIA PAGA</p><h1 className="text-3xl font-semibold">Anúncios da carteira</h1><p className="text-muted-foreground text-sm mt-3">Selecione o cliente para analisar investimento, contatos e campanhas. Métricas precisam ser avaliadas junto às metas e ao retorno comercial.</p></div>
    {loading || query.isPending ? <p role="status">Carregando carteira…</p> : query.isError ? <p role="alert" className="text-destructive">Não foi possível consultar os clientes. <button className="underline" onClick={() => query.refetch()}>Tentar novamente</button></p> : <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6">
      <aside><Input aria-label="Buscar cliente de anúncios" placeholder="Buscar cliente…" value={search} onChange={e => setSearch(e.target.value)} /><p className="text-xs text-muted-foreground my-4">{groups.length} clientes · {groups.filter(g => g.ad_account_id).length} com conta vinculada</p><div className="space-y-2 max-h-[65vh] overflow-y-auto">{filtered.map(g => <button key={g.id} type="button" aria-pressed={selected === g.id} onClick={() => setSelected(g.id)} className={"block w-full rounded-xl border p-4 text-left " + (selected === g.id ? "border-primary bg-primary/10" : "border-border bg-card")}><span className="block font-medium text-sm">{g.nome}</span><span className="block mt-2 text-xs text-muted-foreground">{g.ad_account_id ? "Conta vinculada · consultar resultados" : "Aguardando vínculo de conta"}</span></button>)}{!filtered.length && <p className="text-sm text-muted-foreground py-4">Nenhum cliente encontrado.</p>}</div></aside>
      <section className="rounded-2xl border border-border bg-card p-5 min-w-0">{client ? <><h2 className="font-semibold text-xl mb-1">{client.nome}</h2><p className="text-xs text-muted-foreground mb-6">{client.gestor_responsavel || "Gestor a definir"}</p><MetaAdsTab grupoId={client.group_id} grupoDbId={client.id} onAccountChanged={() => query.refetch()} /></> : <div className="min-h-72 flex flex-col justify-center text-center"><h2 className="font-semibold text-xl">Uma conta por vez. Uma visão clara.</h2><p className="text-sm text-muted-foreground mt-3">Escolha um cliente ao lado para consultar os dados reais da Meta.<br />Nenhuma campanha é criada ou alterada por esta área.</p></div>}</section>
    </div>}
  </main></div></SidebarProvider>;
}
