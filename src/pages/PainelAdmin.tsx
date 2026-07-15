import { useState, useEffect, useMemo } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DollarSign, Users, TrendingUp, Activity, Shield, Bell, FileText, Settings } from "lucide-react";
import { toast } from "sonner";

export default function PainelAdmin() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isAdmin, isMaster, loading: profileLoading } = useProfile();
  const [grupos, setGrupos] = useState<any[]>([]);
  const [actionsLog, setActionsLog] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [briefings, setBriefings] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileLoading && !isMaster) {
      navigate("/performance");
    }
  }, [isMaster, profileLoading, navigate]);

  useEffect(() => {
    if (isMaster) loadData();
  }, [isMaster]);

  const loadData = async () => {
    setLoading(true);
    const [gruposRes, actionsRes, notifRes, briefingsRes] = await Promise.all([
      supabase.from("whatsapp_grupos").select("*").order("nome"),
      supabase.from("master_actions_log").select("*").order("executed_at", { ascending: false }).limit(50),
      supabase.from("master_notifications").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("executive_briefings").select("*").order("briefing_date", { ascending: false }).limit(10),
    ]);
    setGrupos(gruposRes.data || []);
    setActionsLog(actionsRes.data || []);
    setNotifications(notifRes.data || []);
    setBriefings(briefingsRes.data || []);
    setLoading(false);
  };

  const mrr = useMemo(() => {
    return grupos.reduce((sum, g) => sum + (g.investimento_ads || 0), 0);
  }, [grupos]);

  const toggleCoach = async (active: boolean) => {
    if (!coachConfig) return;
    const { error } = await supabase.from("coach_config").update({ ativo: active }).eq("id", coachConfig.id);
    if (!error) {
      setCoachConfig({ ...coachConfig, ativo: active });
      toast.success(`CS Coach ${active ? "ativado" : "pausado"}`);
    }
  };

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isMaster) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar isAdmin={isAdmin} isMaster={isMaster} onSignOut={signOut} />
        <main className="flex-1 p-6 overflow-auto">
          <div className="flex items-center gap-3 mb-6">
            <SidebarTrigger />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-amber-500" />
                Painel Master
              </h1>
              <p className="text-sm text-muted-foreground">Visão estratégica completa da operação</p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Investimento Total Ads</p>
                  <p className="text-xl font-bold">R$ {mrr.toLocaleString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Clientes Ativos</p>
                  <p className="text-xl font-bold">{grupos.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Activity className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Ações Master</p>
                  <p className="text-xl font-bold">{actionsLog.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Bell className="w-8 h-8 text-amber-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Notificações</p>
                  <p className="text-xl font-bold">{notifications.filter(n => !n.lida).length} novas</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="financeiro" className="space-y-4">
            <TabsList>
              <TabsTrigger value="financeiro">💰 Financeiro</TabsTrigger>
              <TabsTrigger value="acoes">📋 Ações Master</TabsTrigger>
              <TabsTrigger value="notificacoes">🔔 Notificações</TabsTrigger>
              <TabsTrigger value="briefings">☀️ Briefings</TabsTrigger>
              <TabsTrigger value="config">⚙️ Configurações</TabsTrigger>
            </TabsList>

            <TabsContent value="financeiro">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Receita por Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left p-2">Cliente</th>
                          <th className="text-left p-2">Plano</th>
                          <th className="text-left p-2">Gestor</th>
                          <th className="text-right p-2">Investimento Ads</th>
                          <th className="text-left p-2">Desde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupos.sort((a, b) => (b.investimento_ads || 0) - (a.investimento_ads || 0)).map(g => (
                          <tr key={g.group_id} className="border-b border-border/10 hover:bg-muted/20">
                            <td className="p-2 font-medium">{g.nome}</td>
                            <td className="p-2"><Badge variant="outline">{g.plano || "N/A"}</Badge></td>
                            <td className="p-2 text-muted-foreground">{g.gestor_responsavel || "-"}</td>
                            <td className="p-2 text-right font-mono">{g.investimento_ads ? `R$ ${g.investimento_ads.toLocaleString("pt-BR")}` : "-"}</td>
                            <td className="p-2 text-muted-foreground">{g.data_entrada || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="acoes">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Histórico de Ações Master</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {actionsLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhuma ação registrada ainda</p>
                    ) : (
                      <div className="space-y-3">
                        {actionsLog.map(a => (
                          <div key={a.id} className="p-3 rounded-lg border border-border/30 bg-muted/10">
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant="outline">{a.action_type}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(a.executed_at).toLocaleString("pt-BR")}</span>
                            </div>
                            <p className="text-sm">{a.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">por {a.executed_by}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notificacoes">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notificações Recentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação ainda</p>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map(n => (
                          <div key={n.id} className={`p-3 rounded-lg border ${n.lida ? "border-border/20 bg-muted/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <Badge variant={n.lida ? "outline" : "default"}>{n.tipo}</Badge>
                                {!n.lida && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                              </div>
                              <span className="text-xs text-muted-foreground">{new Date(n.enviada_em).toLocaleString("pt-BR")}</span>
                            </div>
                            <p className="text-sm font-medium">{n.titulo}</p>
                            <p className="text-xs text-muted-foreground mt-1">{n.mensagem.slice(0, 150)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="briefings">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Briefings Executivos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {briefings.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum briefing gerado ainda</p>
                    ) : (
                      <div className="space-y-4">
                        {briefings.map(b => (
                          <div key={b.id} className="p-4 rounded-lg border border-border/30">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{new Date(b.briefing_date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>
                              <div className="flex gap-2">
                                {b.enviado_alisson && <Badge variant="outline" className="text-green-500">✓ Alisson</Badge>}
                                {b.enviado_priscilla && <Badge variant="outline" className="text-green-500">✓ Priscilla</Badge>}
                              </div>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{b.conteudo}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="config">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configurações do Sistema</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label className="text-sm font-medium">CS Coach Automático</Label>
                      <p className="text-xs text-muted-foreground">Cutucadas e alertas automáticos para a equipe</p>
                    </div>
                    <Switch
                      checked={coachConfig?.ativo ?? false}
                      onCheckedChange={toggleCoach}
                    />
                  </div>
                  {coachConfig && (
                    <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-border/30">
                      <div>
                        <Label className="text-xs text-muted-foreground">Horário</Label>
                        <p className="text-sm">{coachConfig.horario_inicio} - {coachConfig.horario_fim}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Máx mensagens/dia/pessoa</Label>
                        <p className="text-sm">{coachConfig.max_mensagens_dia_por_pessoa}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Intervalo mínimo</Label>
                        <p className="text-sm">{coachConfig.intervalo_minimo_minutos} min</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Tom</Label>
                        <p className="text-sm capitalize">{coachConfig.tom}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </SidebarProvider>
  );
}
