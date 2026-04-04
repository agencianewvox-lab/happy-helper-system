import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, ExternalLink, Smile, Meh, Frown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NpsSurvey {
  id: string;
  score: number;
  comment: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  created_at: string;
}

interface Props {
  groupId: string;
}

export function NpsSurveyTab({ groupId }: Props) {
  const [surveys, setSurveys] = useState<NpsSurvey[]>([]);
  const [loading, setLoading] = useState(true);

  const surveyUrl = `${window.location.origin}/pesquisa-nps/${groupId}`;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("nps_surveys" as any)
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (data) setSurveys(data as unknown as NpsSurvey[]);
      setLoading(false);
    };
    load();
  }, [groupId]);

  const copyLink = () => {
    navigator.clipboard.writeText(surveyUrl);
    toast.success("Link copiado!");
  };

  const avgScore = surveys.length > 0
    ? (surveys.reduce((sum, s) => sum + s.score, 0) / surveys.length).toFixed(1)
    : null;

  const getScoreIcon = (score: number) => {
    if (score <= 6) return <Frown className="w-4 h-4 text-red-500" />;
    if (score <= 8) return <Meh className="w-4 h-4 text-amber-500" />;
    return <Smile className="w-4 h-4 text-emerald-500" />;
  };

  const getScoreBg = (score: number) => {
    if (score <= 6) return "bg-red-500";
    if (score <= 8) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-4">
      {/* Link section */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/30">
        <h3 className="text-sm font-semibold">Link da Pesquisa NPS</h3>
        <p className="text-xs text-muted-foreground">Envie este link ao cliente para coletar a avaliação NPS real.</p>
        <div className="flex gap-2">
          <code className="flex-1 text-xs bg-background rounded px-3 py-2 truncate border border-border/50">
            {surveyUrl}
          </code>
          <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5 shrink-0">
            <Copy className="w-3.5 h-3.5" />
            Copiar
          </Button>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <a href={surveyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {/* Stats */}
      {surveys.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/30 rounded-lg p-3 text-center border border-border/30">
            <p className="text-2xl font-bold">{avgScore}</p>
            <p className="text-[10px] text-muted-foreground">Média NPS</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center border border-border/30">
            <p className="text-2xl font-bold">{surveys.length}</p>
            <p className="text-[10px] text-muted-foreground">Respostas</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center border border-border/30">
            <p className="text-2xl font-bold">
              {surveys.filter(s => s.score >= 9).length}
            </p>
            <p className="text-[10px] text-muted-foreground">Promotores</p>
          </div>
        </div>
      )}

      {/* Responses list */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Respostas ({surveys.length})</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : surveys.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma resposta recebida ainda. Envie o link ao cliente!
          </p>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {surveys.map((s) => (
                <div key={s.id} className="bg-muted/20 border border-border/30 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(s.score)}
                      <Badge className={`${getScoreBg(s.score)} text-white text-xs`}>
                        {s.score}/10
                      </Badge>
                      <span className="text-xs font-medium">{s.respondent_name || "Anônimo"}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {s.comment && (
                    <p className="text-xs text-muted-foreground italic">"{s.comment}"</p>
                  )}
                  {s.respondent_email && (
                    <p className="text-[10px] text-muted-foreground">{s.respondent_email}</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
