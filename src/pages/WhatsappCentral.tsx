import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Smartphone, RefreshCw, ShieldCheck, Activity, MessageSquare, ArrowDownToLine, AlertTriangle, Loader2 } from 'lucide-react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { OnboardingSendDialog } from '@/components/OnboardingSendDialog';
import { whatsappRequest } from '@/lib/whatsapp';

interface Status {
  checkedAt: string; instance: string; connection: string;
  webhook: { checked: boolean; enabled: boolean; host: string | null; targetMatches: boolean; messagesEventEnabled: boolean };
  reception: { available: boolean; lastMessageAt: string | null; messages24h: number | null };
  groupsAvailable: boolean;
  groups: { group_id: string; nome: string; categoria: string | null; responsavel_master: string | null }[];
}
function date(value: string | null) { return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Nenhum registro'; }

export default function WhatsappCentral() {
  const { isMaster, isAdmin, loading } = useProfile();
  const { signOut } = useAuth();
  const status = useQuery({ queryKey: ['whatsapp-central'], queryFn: () => whatsappRequest<Status>(), enabled: !loading && isMaster, staleTime: 0, refetchInterval: 60000, retry: false });
  if (loading) return <div role="status" className="p-12">Verificando acesso…</div>;
  if (!isMaster) return <Navigate to="/" replace />;
  const data = status.data;
  const connected = data?.connection === 'open';
  const receiving = data?.reception.available && (data.reception.messages24h ?? 0) > 0;
  const webhookReady = !!(data?.webhook.checked && data.webhook.enabled && data.webhook.targetMatches && data.webhook.messagesEventEnabled);
  return <SidebarProvider><div className="min-h-screen flex w-full bg-background">
    <DashboardSidebar isAdmin={isAdmin} isMaster={isMaster} onSignOut={signOut} />
    <main className="flex-1 min-w-0 p-4 sm:p-8 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><SidebarTrigger /><span className="login-section-number">ACESSO MASTER / INTEGRAÇÕES</span></div><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={16} />Acesso restrito</span></div>
      <div className="workspace-page-heading flex flex-wrap items-end justify-between gap-4 my-6"><div><h1 className="text-3xl font-semibold">WhatsApp central</h1><p>Conexão, recebimento e onboarding. Cada etapa com seu próprio status.</p></div><Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}><RefreshCw size={15} className={'mr-2 ' + (status.isFetching ? 'animate-spin' : '')} />Atualizar diagnóstico</Button></div>
      {status.isPending && <div role="status" className="flex items-center gap-3 rounded-xl border bg-card p-8"><Loader2 className="animate-spin" />Consultando a Evolution e os registros do painel…</div>}
      {status.error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 mb-6"><strong>Não foi possível atualizar o diagnóstico.</strong><p className="text-sm mt-1">{status.error.message}</p></div>}
      {data && <>
        <div className="grid md:grid-cols-3 gap-4">
          <StatusCard icon={Smartphone} title="Conexão do telefone" value={connected ? 'Conectado' : data.connection === 'unavailable' ? 'Consulta indisponível' : 'Desconectado'} detail="Estado consultado diretamente na Evolution." good={connected} />
          <StatusCard icon={ArrowDownToLine} title="Mensagens no painel" value={!data.reception.available ? 'Consulta indisponível' : receiving ? data.reception.messages24h + ' nas últimas 24h' : 'Sem registros recentes'} detail={'Última mensagem: ' + date(data.reception.lastMessageAt)} good={!!receiving} />
          <StatusCard icon={Activity} title="Webhook de eventos" value={!data.webhook.checked ? 'Consulta indisponível' : webhookReady ? 'Destino e evento corretos' : 'Revisar configuração'} detail={!data.webhook.checked ? 'Não foi possível consultar a Evolution.' : `Ativo: ${data.webhook.enabled ? 'sim' : 'não'} · Destino do painel: ${data.webhook.targetMatches ? 'correto' : 'diferente'} · MESSAGES_UPSERT: ${data.webhook.messagesEventEnabled ? 'ativo' : 'ausente'}.`} good={webhookReady} />
        </div>
        {!receiving && <div className="flex gap-3 p-5 mt-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle size={20} className="shrink-0" /><div><p className="font-medium text-sm">Recebimento ainda precisa de validação</p><p className="text-sm mt-1 leading-relaxed">Se os grupos têm conversas recentes, mas o painel não mostra registros, o encaminhamento de eventos precisa ser corrigido. O estado do telefone, sozinho, não comprova que as mensagens estão chegando.</p></div></div>}
        <section className="mt-8 rounded-2xl border bg-card overflow-hidden">
          <div className="p-6 border-b flex gap-3"><MessageSquare className="text-primary" size={21} /><div><h2 className="font-semibold text-lg">Onboarding dos clientes</h2><p className="text-sm text-muted-foreground mt-1">Escolha o cliente, revise a mensagem e envie. Nenhum envio é feito automaticamente.</p></div></div>
          {!data.groupsAvailable ? <p role="alert" className="p-6 text-destructive">Não foi possível consultar os clientes.</p> : data.groups.length === 0 ? <p className="p-6 text-muted-foreground">Nenhum cliente cadastrado.</p> : <div className="divide-y">{data.groups.map(group => <div key={group.group_id} className="px-6 py-4 flex flex-wrap justify-between items-center gap-3"><div><p className="font-medium text-sm">{group.nome}</p><p className="text-xs text-muted-foreground mt-1">{group.categoria || 'Cliente New Vox'} · Link público, sem login</p></div><OnboardingSendDialog groupId={group.group_id} groupName={group.nome} categoria={group.categoria} responsavelMaster={group.responsavel_master} /></div>)}</div>}
        </section>
        <div className="mt-5 text-xs text-muted-foreground space-y-2 leading-relaxed"><p>Última consulta: {date(data.checkedAt)} (horário de Brasília). Atualização automática a cada minuto.</p><p>A instância atual também atende o VOXI. Esta área não desconecta o telefone nem altera o webhook compartilhado.</p><p>Um envio aceito pela Evolution não significa entrega ou leitura no WhatsApp. Confira a conversa para confirmar.</p></div>
      </>}
    </main>
  </div></SidebarProvider>;
}
function StatusCard({ icon: Icon, title, value, detail, good }: { icon: typeof Smartphone; title: string; value: string; detail: string; good: boolean }) {
  return <Card><CardContent className="p-6"><div className="flex items-center justify-between mb-6"><Icon size={21} className="text-muted-foreground" /><span className={'h-2 w-2 rounded-full ' + (good ? 'bg-emerald-500' : 'bg-amber-500')} /></div><p className="text-xs text-muted-foreground">{title}</p><p className="text-xl font-semibold tracking-tight mt-2">{value}</p><p className="text-xs text-muted-foreground leading-relaxed mt-3">{detail}</p></CardContent></Card>;
}
