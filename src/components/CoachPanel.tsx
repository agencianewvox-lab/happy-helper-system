import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CoachMessage, CoachConfig, COACH_TYPE_LABELS } from "@/types/client";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Send, Clock, User, MessageSquare, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ALL_TYPES = Object.keys(COACH_TYPE_LABELS);

export function CoachPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="CS Coach"
        >
          <Bot className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            CS Coach — Vox Proativa
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="history" className="h-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="mt-4">
            <CoachHistory />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <CoachConfigPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CoachHistory() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("coach_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setMessages((data as any[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayMsgs = messages.filter(m => m.created_at?.startsWith(today));
    const byPerson: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const m of todayMsgs) {
      byPerson[m.destinatario_nome] = (byPerson[m.destinatario_nome] || 0) + 1;
      byType[m.tipo] = (byType[m.tipo] || 0) + 1;
    }
    return { total: todayMsgs.length, byPerson, byType };
  }, [messages]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/60">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Cutucadas hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{Object.keys(stats.byPerson).length}</p>
            <p className="text-xs text-muted-foreground">Pessoas alcançadas</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{Object.keys(stats.byType).length}</p>
            <p className="text-xs text-muted-foreground">Tipos diferentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Per person breakdown */}
      {Object.keys(stats.byPerson).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byPerson).map(([name, count]) => (
            <Badge key={name} variant="outline" className="text-xs">
              <User className="w-3 h-3 mr-1" />
              {name.split(" ")[0]}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Messages list */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma cutucada enviada ainda.</p>
          )}
          {messages.map((m) => (
            <Card key={m.id} className="bg-card/40 border-border/30">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {COACH_TYPE_LABELS[m.tipo] || m.tipo}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        → {m.destinatario_nome}
                      </span>
                      {m.resultado && (
                        <Badge variant={m.resultado === "feito" ? "default" : "outline"} className="text-[10px]">
                          {m.resultado === "feito" ? <CheckCircle className="w-3 h-3 mr-1" /> : null}
                          {m.resultado}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{m.mensagem}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {m.enviada_em ? new Date(m.enviada_em).toLocaleString("pt-BR") : new Date(m.created_at).toLocaleString("pt-BR")}
                      </span>
                      {m.enviada && (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <Send className="w-3 h-3" /> Enviada
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CoachConfigPanel() {
  const [config, setConfig] = useState<CoachConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("coach_config").select("*").limit(1);
      if (data?.[0]) setConfig(data[0] as any);
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase.from("coach_config").update({
      ativo: config.ativo,
      horario_inicio: config.horario_inicio,
      horario_fim: config.horario_fim,
      max_mensagens_dia_por_pessoa: config.max_mensagens_dia_por_pessoa,
      intervalo_minimo_minutos: config.intervalo_minimo_minutos,
      tipos_ativos: config.tipos_ativos,
    }).eq("id", config.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else toast.success("Configuração salva!");
  };

  const testCoach = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("cs-coach");
      if (error) throw error;
      toast.success(`Coach executado: ${data?.messages_sent || 0} mensagens, ${data?.opportunities_detected || 0} oportunidades`);
    } catch (e: any) {
      toast.error("Erro: " + (e.message || "falha"));
    }
    setTesting(false);
  };

  if (loading || !config) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[450px]">
      <div className="space-y-6 pr-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Coach Ativo</p>
            <p className="text-xs text-muted-foreground">Ativa ou desativa todas as cutucadas</p>
          </div>
          <Switch checked={config.ativo} onCheckedChange={(v) => setConfig({ ...config, ativo: v })} />
        </div>

        {/* Hours */}
        <div className="space-y-2">
          <p className="font-medium text-sm">Horário de funcionamento</p>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={config.horario_inicio}
              onChange={(e) => setConfig({ ...config, horario_inicio: e.target.value })}
              className="bg-background border rounded px-2 py-1 text-sm"
            />
            <span className="text-muted-foreground">até</span>
            <input
              type="time"
              value={config.horario_fim}
              onChange={(e) => setConfig({ ...config, horario_fim: e.target.value })}
              className="bg-background border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        {/* Max per day */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">Máx. mensagens/dia por pessoa</p>
            <Badge variant="outline">{config.max_mensagens_dia_por_pessoa}</Badge>
          </div>
          <Slider
            value={[config.max_mensagens_dia_por_pessoa]}
            onValueChange={([v]) => setConfig({ ...config, max_mensagens_dia_por_pessoa: v })}
            min={1} max={10} step={1}
          />
        </div>

        {/* Min interval */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">Intervalo mínimo entre mensagens</p>
            <Badge variant="outline">{config.intervalo_minimo_minutos} min</Badge>
          </div>
          <Slider
            value={[config.intervalo_minimo_minutos]}
            onValueChange={([v]) => setConfig({ ...config, intervalo_minimo_minutos: v })}
            min={30} max={180} step={15}
          />
        </div>

        {/* Types */}
        <div className="space-y-3">
          <p className="font-medium text-sm">Tipos de cutucada ativos</p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_TYPES.map((tipo) => (
              <label key={tipo} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.tipos_ativos.includes(tipo)}
                  onCheckedChange={(checked) => {
                    const newTipos = checked
                      ? [...config.tipos_ativos, tipo]
                      : config.tipos_ativos.filter(t => t !== tipo);
                    setConfig({ ...config, tipos_ativos: newTipos });
                  }}
                />
                {COACH_TYPE_LABELS[tipo]}
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar Configuração
          </Button>
          <Button variant="outline" onClick={testCoach} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Executar Agora
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

export default CoachPanel;
