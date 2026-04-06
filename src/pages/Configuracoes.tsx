import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Settings, Brain, MessageSquare, BarChart3, Shield,
  RefreshCw, AlertTriangle, Clock, Zap, Users, Filter, Lock,
} from "lucide-react";
import { toast } from "sonner";
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { SystemConfigCard, type SystemConfig } from "@/components/config/SystemConfigCard";
import { PasswordVerificationDialog } from "@/components/config/PasswordVerificationDialog";

interface PromptConfig {
  id: string;
  prompt_key: string;
  prompt_label: string;
  prompt_category: string;
  prompt_value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  // Prompt categories
  "Chat IA": Brain,
  "WhatsApp": MessageSquare,
  "Feedback": BarChart3,
  "Briefing": BarChart3,
  "CS Coach": Shield,
  "Geral": Settings,
  // System config categories
  "SLA": Clock,
  "Sentimento": BarChart3,
  "Sentimento - Palavras": MessageSquare,
  "Risco de Churn": AlertTriangle,
  "Prioridade Máxima": Zap,
  "FRT": Clock,
  "Filtros": Filter,
  "Equipe": Users,
  "Segurança": Lock,
};

type TabType = "prompts" | "system";

export default function Configuracoes() {
  const { isMaster, profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();

  // Prompts state
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [promptEdits, setPromptEdits] = useState<Record<string, string>>({});
  const [promptSaving, setPromptSaving] = useState<string | null>(null);

  // System configs state
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [configEdits, setConfigEdits] = useState<Record<string, string>>({});
  const [configSaving, setConfigSaving] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("prompts");

  // Password verification
  const [pendingSave, setPendingSave] = useState<{ type: "prompt" | "config"; item: any } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [promptRes, configRes] = await Promise.all([
      supabase.from("ai_prompts_config").select("*").order("prompt_category").order("prompt_label"),
      supabase.from("system_configs").select("*").order("config_category").order("config_label"),
    ]);

    if (promptRes.data) setPrompts(promptRes.data as unknown as PromptConfig[]);
    if (configRes.data) setConfigs(configRes.data as unknown as SystemConfig[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profileLoading && !isMaster) {
      navigate("/performance");
      return;
    }
    if (!profileLoading && isMaster) fetchAll();
  }, [profileLoading, isMaster, navigate, fetchAll]);

  // ─── Prompt save ───
  const handlePromptSave = async (prompt: PromptConfig) => {
    const newValue = promptEdits[prompt.id];
    if (newValue === undefined || newValue === prompt.prompt_value) return;
    setPendingSave({ type: "prompt", item: prompt });
  };

  const executePromptSave = async (prompt: PromptConfig) => {
    const newValue = promptEdits[prompt.id]!;
    setPromptSaving(prompt.id);
    const { error } = await supabase
      .from("ai_prompts_config")
      .update({ prompt_value: newValue, updated_at: new Date().toISOString(), updated_by: profile?.full_name || "Master" })
      .eq("id", prompt.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(`"${prompt.prompt_label}" atualizado!`);
      setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, prompt_value: newValue, updated_at: new Date().toISOString(), updated_by: profile?.full_name || "Master" } : p));
      setPromptEdits(prev => { const n = { ...prev }; delete n[prompt.id]; return n; });
    }
    setPromptSaving(null);
  };

  // ─── Config save ───
  const handleConfigSave = async (config: SystemConfig) => {
    const newValue = configEdits[config.id];
    if (newValue === undefined || newValue === config.config_value) return;
    setPendingSave({ type: "config", item: config });
  };

  const executeConfigSave = async (config: SystemConfig) => {
    const newValue = configEdits[config.id]!;
    setConfigSaving(config.id);
    const { error } = await supabase
      .from("system_configs")
      .update({ config_value: newValue, updated_at: new Date().toISOString(), updated_by: profile?.full_name || "Master" })
      .eq("id", config.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(`"${config.config_label}" atualizado!`);
      setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, config_value: newValue, updated_at: new Date().toISOString(), updated_by: profile?.full_name || "Master" } : c));
      setConfigEdits(prev => { const n = { ...prev }; delete n[config.id]; return n; });
    }
    setConfigSaving(null);
  };

  const handlePasswordConfirm = () => {
    if (!pendingSave) return;
    if (pendingSave.type === "prompt") executePromptSave(pendingSave.item);
    else executeConfigSave(pendingSave.item);
    setPendingSave(null);
  };

  const promptCategories = [...new Set(prompts.map(p => p.prompt_category))];
  const configCategories = [...new Set(configs.map(c => c.config_category))];

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
              <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
              <div>
                <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-500" />
                  Central de Configurações
                </h1>
                <p className="text-xs text-muted-foreground">
                  Prompts, regras, limiares e parâmetros do sistema
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">
                <Shield className="w-3 h-3 mr-1" />
                MASTER ONLY
              </Badge>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={fetchAll}>
                <RefreshCw className="w-3 h-3" />
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        {/* Top-level tabs: Prompts vs System */}
        <div className="flex gap-2 mb-6">
          <Button
            size="sm"
            variant={activeTab === "prompts" ? "default" : "outline"}
            className="gap-1.5 text-xs"
            onClick={() => setActiveTab("prompts")}
          >
            <Brain className="w-3.5 h-3.5" />
            Prompts da IA
          </Button>
          <Button
            size="sm"
            variant={activeTab === "system" ? "default" : "outline"}
            className="gap-1.5 text-xs"
            onClick={() => setActiveTab("system")}
          >
            <Settings className="w-3.5 h-3.5" />
            Regras do Sistema
          </Button>
        </div>

        {/* PROMPTS TAB */}
        {activeTab === "prompts" && (
          <Tabs defaultValue={promptCategories[0] || "Geral"}>
            <TabsList className="mb-6 flex-wrap h-auto gap-1">
              {promptCategories.map(cat => {
                const Icon = CATEGORY_ICONS[cat] || Settings;
                return (
                  <TabsTrigger key={cat} value={cat} className="text-xs gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {cat}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {promptCategories.map(cat => (
              <TabsContent key={cat} value={cat} className="space-y-4">
                {prompts.filter(p => p.prompt_category === cat).map(prompt => {
                  const currentValue = promptEdits[prompt.id] ?? prompt.prompt_value;
                  const hasChanges = promptEdits[prompt.id] !== undefined && promptEdits[prompt.id] !== prompt.prompt_value;
                  const isSaving = promptSaving === prompt.id;
                  return (
                    <SystemConfigCard
                      key={prompt.id}
                      config={{
                        id: prompt.id,
                        config_key: prompt.prompt_key,
                        config_label: prompt.prompt_label,
                        config_category: prompt.prompt_category,
                        config_value: prompt.prompt_value,
                        config_type: "textarea",
                        description: prompt.description,
                        updated_at: prompt.updated_at,
                        updated_by: prompt.updated_by,
                      }}
                      editedValue={promptEdits[prompt.id]}
                      onValueChange={(id, val) => setPromptEdits(prev => ({ ...prev, [id]: val }))}
                      onSave={() => handlePromptSave(prompt)}
                      onCancel={(id) => setPromptEdits(prev => { const n = { ...prev }; delete n[id]; return n; })}
                      saving={isSaving}
                    />
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* SYSTEM TAB */}
        {activeTab === "system" && (
          <Tabs defaultValue={configCategories[0] || "SLA"}>
            <TabsList className="mb-6 flex-wrap h-auto gap-1">
              {configCategories.map(cat => {
                const Icon = CATEGORY_ICONS[cat] || Settings;
                return (
                  <TabsTrigger key={cat} value={cat} className="text-xs gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {cat}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {configCategories.map(cat => (
              <TabsContent key={cat} value={cat} className="space-y-4">
                {configs.filter(c => c.config_category === cat).map(config => (
                  <SystemConfigCard
                    key={config.id}
                    config={config}
                    editedValue={configEdits[config.id]}
                    onValueChange={(id, val) => setConfigEdits(prev => ({ ...prev, [id]: val }))}
                    onSave={() => handleConfigSave(config)}
                    onCancel={(id) => setConfigEdits(prev => { const n = { ...prev }; delete n[id]; return n; })}
                    saving={configSaving === config.id}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>

      {/* Password verification dialog */}
      <PasswordVerificationDialog
        open={!!pendingSave}
        onClose={() => setPendingSave(null)}
        onConfirm={handlePasswordConfirm}
        label={pendingSave?.type === "prompt" ? pendingSave.item.prompt_label : pendingSave?.item?.config_label || ""}
      />
    </div>
  );
}
