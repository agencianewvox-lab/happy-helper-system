import { lazy, Suspense, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Download, FileText, Maximize2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadOnboardingPdf, type OnboardingResponse } from "@/lib/onboarding-pdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  groupId: string;
  groupName: string;
  ownerId?: string;
}

const OnboardingPresentation = lazy(() => import("./OnboardingPresentation"));

const FIELD_LABELS: Record<string, string> = {
  clinic_name: "Nome da Clínica",
  cnpj: "CNPJ",
  responsible_name: "Responsável",
  responsible_role: "Cargo",
  whatsapp: "WhatsApp",
  attendant_name: "Atendente WhatsApp",
  instagram: "Instagram",
  website: "Site / Landing Page",
  commercial_email: "E-mail Comercial",
  city: "Cidade",
  state: "Estado",
  service_area: "Região / Bairros",
  max_radius_km: "Raio máximo (km)",
  specialties: "Especialidades",
  main_treatment: "Tratamento Principal",
  treatment_reason: "Motivo do Tratamento",
  avg_ticket: "Ticket Médio",
  payment_options: "Condições de Pagamento",
  capacity_per_day: "Capacidade (pacientes/dia)",
  monthly_revenue: "Faturamento Mensal",
  revenue_goal: "Meta de Faturamento",
  management_software: "Software de Gestão",
  age_range: "Faixa Etária",
  predominant_gender: "Gênero Predominante",
  socioeconomic_class: "Classe Socioeconômica",
  patient_pains: "Dores do Paciente",
  main_patient_pain: "Principal Dor",
  post_treatment_feeling: "Pós-Tratamento",
  competitors: "Concorrentes",
  references: "Referências",
  differentials: "Diferenciais",
  past_marketing: "Marketing Anterior",
  failed_strategies: "O que não funcionou",
  ad_budget: "Investimento em Anúncios",
  traffic_goal: "Objetivo Tráfego Pago",
  leads_goal: "Meta de Leads/mês",
  appointments_goal: "Meta de Consultas/mês",
  satisfaction_criteria: "Critério de Satisfação",
  three_month_expectation: "Expectativa 3 meses",
  terms_accepted: "Termo Aceito",
};

const SKIP_KEYS = ["terms_accepted"];

const renderValue = (key: string, value: unknown): string => {
  if (Array.isArray(value)) {
    if (key === "ad_budget") return `R$ ${(value[0] || 0).toLocaleString("pt-BR")}`;
    return value.length > 0 ? value.join(", ") : "—";
  }
  if (typeof value === "boolean") return value ? "Sim ✅" : "Não ❌";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return value === null || value === undefined || value === "" ? "—" : String(value);
};

function ResponseGrid({ responses }: { responses: Record<string, unknown> }) {
  return (
    <div className="grid gap-2 pb-4">
      {Object.entries(responses)
        .filter(([key]) => !SKIP_KEYS.includes(key))
        .map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5 p-2 rounded bg-muted/30 border border-border/30">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {FIELD_LABELS[key] || key.replace(/_/g, " ")}
            </span>
            <span className="text-xs leading-relaxed text-foreground break-words whitespace-pre-wrap">
              {renderValue(key, value)}
            </span>
          </div>
        ))}
    </div>
  );
}

export function OnboardingTab({ groupId, groupName, ownerId }: Props) {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setPresentationOpen(false);
    setFullOpen(false);
    const fetchData = async () => {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from("onboarding_responses")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active) return;
      setLoadError(Boolean(error));
      setData(!error && rows && rows.length > 0 ? rows[0] as OnboardingResponse : null);
      setLoading(false);
    };
    fetchData();
    return () => { active = false; };
  }, [groupId]);

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">Carregando...</div>;
  }

  if (loadError) {
    return <div role="alert" className="py-8 text-center text-sm text-destructive">Não foi possível carregar o onboarding. Tente novamente mais tarde.</div>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <FileText className="w-10 h-10 opacity-40" />
        <p className="text-sm">Nenhum onboarding preenchido ainda.</p>
        <p className="text-xs opacity-60">Envie o link de onboarding para o cliente preencher.</p>
      </div>
    );
  }

  const responses = data.responses || {};
  const createdAt = new Date(data.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadOnboardingPdf(data, groupName);
    } catch {
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="space-y-3 px-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Preenchido em {createdAt}</span>
            <Badge variant="secondary" className="text-[10px]">{data.survey_type === "clinica" ? "Clínica" : "Genérico"}</Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" className="text-xs gap-1.5 h-8" onClick={() => setPresentationOpen(true)}>
              <Presentation className="w-3.5 h-3.5" /> Apresentar onboarding
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8" disabled={downloading} onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              {downloading ? "Gerando PDF..." : "Baixar PDF"}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-8" onClick={() => setFullOpen(true)}>
              <Maximize2 className="w-3.5 h-3.5" />
              Ver completo
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Apresentação HTML pronta com as respostas deste formulário. Campos não preenchidos ficam como pontos de alinhamento.</p>

        <ScrollArea className="max-h-[45vh]">
          <ResponseGrid responses={responses} />
        </ScrollArea>
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="w-[96vw] max-w-4xl h-[92vh] p-0 flex flex-col overflow-hidden">
          <div className="flex flex-col h-full min-h-0">
            <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/50 shrink-0">
              <DialogTitle className="text-base">Respostas do Onboarding</DialogTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Preenchido em {createdAt}</span>
                <Badge variant="secondary" className="text-[10px]">{data.survey_type === "clinica" ? "Clínica" : "Genérico"}</Badge>
              </div>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6 pt-3">
              <ScrollArea className="h-full w-full">
                <ResponseGrid responses={responses} />
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {presentationOpen && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-[60] grid place-items-center bg-background text-sm">Preparando apresentação…</div>}>
          <OnboardingPresentation key={`${groupId}:${data.created_at}:${ownerId}`} response={data} groupName={groupName} ownerId={ownerId} onClose={() => setPresentationOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
