import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, ExternalLink, Smile, Meh, Frown, Building2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NpsSurvey {
  id: string;
  score: number;
  comment: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  survey_type: string;
  quality_rating: string | null;
  communication_rating: string | null;
  results_rating: string | null;
  manager_rating: string | null;
  improvement_comment: string | null;
  referral_1_name: string | null;
  referral_1_company: string | null;
  referral_1_contact: string | null;
  referral_2_name: string | null;
  referral_2_company: string | null;
  referral_2_contact: string | null;
  referral_3_name: string | null;
  referral_3_company: string | null;
  referral_3_contact: string | null;
  created_at: string;
}

interface Props {
  groupId: string;
  categoria?: string | null;
}

const PUBLISHED_APP_URL = "https://paineldecontrolenv.lovable.app";

export function NpsSurveyTab({ groupId, categoria }: Props) {
  const isClinica = categoria?.toLowerCase() === "clínicas";
  const surveyType = isClinica ? "clinica" : "operacao";

  const [surveys, setSurveys] = useState<NpsSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const publicBaseUrl = useMemo(() => {
    if (typeof window === "undefined") return PUBLISHED_APP_URL;
    const currentOrigin = window.location.origin;
    return currentOrigin.includes("lovable.app") && !currentOrigin.includes("id-preview--")
      ? currentOrigin
      : PUBLISHED_APP_URL;
  }, []);

  const surveyUrl = `${publicBaseUrl}/pesquisa-nps/${encodeURIComponent(groupId)}/${surveyType}`;

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

  const copyLink = async (url: string, label: string) => {
    await navigator.clipboard.writeText(url);
    toast.success(`Link ${label} copiado!`);
  };

  const avgScore =
    surveys.length > 0
      ? (surveys.reduce((sum, s) => sum + s.score, 0) / surveys.length).toFixed(1)
      : null;

  const getScoreIcon = (score: number) => {
    if (score <= 6) return <Frown className="w-4 h-4 text-destructive" />;
    if (score <= 8) return <Meh className="w-4 h-4 text-primary" />;
    return <Smile className="w-4 h-4 text-primary" />;
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score <= 6) return "destructive" as const;
    return "default" as const;
  };

  const hasReferrals = (s: NpsSurvey) =>
    s.referral_1_name || s.referral_2_name || s.referral_3_name;

  return (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/30">
        <h3 className="text-sm font-semibold">
          Link da Pesquisa NPS — {isClinica ? "Clínicas" : "Operação"}
        </h3>
        <p className="text-xs text-muted-foreground">
          Envie este link ao cliente para coletar a avaliação NPS.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 text-xs bg-background rounded px-3 py-2 truncate border border-border/50">
            {surveyUrl}
          </code>
          <Button variant="outline" size="sm" onClick={() => copyLink(surveyUrl, isClinica ? "Clínica" : "Operação")} className="gap-1.5 shrink-0">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <a href={surveyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </div>

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
            <p className="text-2xl font-bold">{surveys.filter((s) => s.score >= 9).length}</p>
            <p className="text-[10px] text-muted-foreground">Promotores</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2">Respostas ({surveys.length})</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : surveys.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma resposta recebida ainda. Envie o link ao cliente!
          </p>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {surveys.map((s) => {
                const isExpanded = expandedId === s.id;
                return (
                  <div
                    key={s.id}
                    className="bg-muted/20 border border-border/30 rounded-lg p-3 space-y-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getScoreIcon(s.score)}
                        <Badge variant={getScoreBadgeVariant(s.score)} className="text-xs">
                          {s.score}/10
                        </Badge>
                        <span className="text-xs font-medium">{s.respondent_name || "Anônimo"}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {s.survey_type === "clinica" ? "Clínica" : "Operação"}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {s.comment && <p className="text-xs text-muted-foreground italic">"{s.comment}"</p>}

                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5 text-xs">
                        {s.quality_rating && (
                          <div><span className="text-muted-foreground">Qualidade: </span><span className="font-medium">{s.quality_rating}</span></div>
                        )}
                        {s.communication_rating && (
                          <div><span className="text-muted-foreground">Comunicação: </span><span className="font-medium">{s.communication_rating}</span></div>
                        )}
                        {s.results_rating && (
                          <div><span className="text-muted-foreground">Resultados: </span><span className="font-medium">{s.results_rating}</span></div>
                        )}
                        {s.manager_rating && (
                          <div><span className="text-muted-foreground">Gestor: </span><span className="font-medium">{s.manager_rating}</span></div>
                        )}
                        {s.improvement_comment && (
                          <div><span className="text-muted-foreground">Sugestão: </span><span className="italic">"{s.improvement_comment}"</span></div>
                        )}
                        {hasReferrals(s) && (
                          <div className="pt-1">
                            <span className="text-muted-foreground font-medium">Indicações:</span>
                            {[
                              { n: s.referral_1_name, c: s.referral_1_company, ct: s.referral_1_contact },
                              { n: s.referral_2_name, c: s.referral_2_company, ct: s.referral_2_contact },
                              { n: s.referral_3_name, c: s.referral_3_company, ct: s.referral_3_contact },
                            ]
                              .filter((r) => r.n)
                              .map((r, i) => (
                                <p key={i} className="text-[11px] ml-2">• {r.n} {r.c && `(${r.c})`} {r.ct && `— ${r.ct}`}</p>
                              ))}
                          </div>
                        )}
                        {s.respondent_email && <p className="text-[10px] text-muted-foreground">{s.respondent_email}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
