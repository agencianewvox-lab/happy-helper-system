import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Save, Loader2, Settings, Brain, MessageSquare,
  BarChart3, Shield, Check, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import newvoxLogo from "@/assets/newvox-logo.jpg";

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
  "Chat IA": Brain,
  "WhatsApp": MessageSquare,
  "Feedback": BarChart3,
  "Briefing": BarChart3,
  "CS Coach": Shield,
  "Geral": Settings,
};

export default function Configuracoes() {
  const { isMaster, profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_prompts_config")
      .select("*")
      .order("prompt_category")
      .order("prompt_label");

    if (!error && data) {
      setPrompts(data as unknown as PromptConfig[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profileLoading && !isMaster) {
      navigate("/performance");
      return;
    }
    if (!profileLoading && isMaster) {
      fetchPrompts();
    }
  }, [profileLoading, isMaster, navigate, fetchPrompts]);

  const handleSave = async (prompt: PromptConfig) => {
    const newValue = editedValues[prompt.id];
    if (newValue === undefined || newValue === prompt.prompt_value) return;

    setSaving(prompt.id);
    const { error } = await supabase
      .from("ai_prompts_config")
      .update({
        prompt_value: newValue,
        updated_at: new Date().toISOString(),
        updated_by: profile?.full_name || "Master",
      })
      .eq("id", prompt.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(`"${prompt.prompt_label}" atualizado com sucesso!`);
      setPrompts(prev =>
        prev.map(p => p.id === prompt.id ? { ...p, prompt_value: newValue, updated_at: new Date().toISOString(), updated_by: profile?.full_name || "Master" } : p)
      );
      setEditedValues(prev => {
        const next = { ...prev };
        delete next[prompt.id];
        return next;
      });
    }
    setSaving(null);
  };

  const categories = [...new Set(prompts.map(p => p.prompt_category))];

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
                  Configurações da IA
                </h1>
                <p className="text-xs text-muted-foreground">
                  Edite todos os prompts e regras do sistema Vox
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">
                <Shield className="w-3 h-3 mr-1" />
                MASTER ONLY
              </Badge>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={fetchPrompts}>
                <RefreshCw className="w-3 h-3" />
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        <Tabs defaultValue={categories[0] || "Geral"}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            {categories.map(cat => {
              const Icon = CATEGORY_ICONS[cat] || Settings;
              return (
                <TabsTrigger key={cat} value={cat} className="text-xs gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {cat}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categories.map(cat => (
            <TabsContent key={cat} value={cat} className="space-y-4">
              {prompts
                .filter(p => p.prompt_category === cat)
                .map(prompt => {
                  const currentValue = editedValues[prompt.id] ?? prompt.prompt_value;
                  const hasChanges = editedValues[prompt.id] !== undefined && editedValues[prompt.id] !== prompt.prompt_value;
                  const isSaving = saving === prompt.id;

                  return (
                    <Card key={prompt.id} className="border-border/40">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-sm font-semibold">{prompt.prompt_label}</CardTitle>
                            {prompt.description && (
                              <CardDescription className="text-xs mt-1">{prompt.description}</CardDescription>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {prompt.updated_by && (
                              <span className="text-[10px] text-muted-foreground">
                                Editado por {prompt.updated_by} em {new Date(prompt.updated_at).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                            {hasChanges && (
                              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                                Não salvo
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Textarea
                          value={currentValue}
                          onChange={(e) =>
                            setEditedValues(prev => ({ ...prev, [prompt.id]: e.target.value }))
                          }
                          className="min-h-[200px] text-xs font-mono leading-relaxed resize-y"
                          placeholder="Digite o conteúdo do prompt..."
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {currentValue.length} caracteres | Chave: {prompt.prompt_key}
                          </span>
                          <div className="flex gap-2">
                            {hasChanges && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() =>
                                  setEditedValues(prev => {
                                    const next = { ...prev };
                                    delete next[prompt.id];
                                    return next;
                                  })
                                }
                              >
                                Cancelar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              disabled={!hasChanges || isSaving}
                              onClick={() => handleSave(prompt)}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : hasChanges ? (
                                <>
                                  <Save className="w-3 h-3" />
                                  Salvar
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3" />
                                  Salvo
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
