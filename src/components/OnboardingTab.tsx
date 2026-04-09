import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  groupId: string;
}

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

const renderValue = (key: string, value: any): string => {
  if (Array.isArray(value)) {
    if (key === "ad_budget") return `R$ ${(value[0] || 0).toLocaleString("pt-BR")}`;
    return value.length > 0 ? value.join(", ") : "—";
  }
  if (typeof value === "boolean") return value ? "Sim ✅" : "Não ❌";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return value?.toString() || "—";
};

function ResponseGrid({ responses }: { responses: Record<string, any> }) {
  return (
    <div className="grid gap-2">
      {Object.entries(responses)
        .filter(([key]) => !SKIP_KEYS.includes(key))
        .map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5 p-2 rounded bg-muted/30 border border-border/30">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {FIELD_LABELS[key] || key.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-foreground break-words whitespace-pre-wrap">
              {renderValue(key, value)}
            </span>
          </div>
        ))}
    </div>
  );
}

export function OnboardingTab({ groupId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fullOpen, setFullOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from("onboarding_responses" as any)
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(1);
      setData(rows && (rows as any[]).length > 0 ? (rows as any[])[0] : null);
      setLoading(false);
    };
    fetchData();
  }, [groupId]);

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">Carregando...</div>;
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

  return (
    <>
      <div className="space-y-3 px-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Preenchido em {createdAt}</span>
            <Badge variant="secondary" className="text-[10px]">{data.survey_type === "clinica" ? "Clínica" : "Genérico"}</Badge>
          </div>
          <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={() => setFullOpen(true)}>
            <Maximize2 className="w-3.5 h-3.5" />
            Ver completo
          </Button>
        </div>

        <ScrollArea className="max-h-[45vh]">
          <ResponseGrid responses={responses} />
        </ScrollArea>
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Respostas do Onboarding</DialogTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Preenchido em {createdAt}</span>
              <Badge variant="secondary" className="text-[10px]">{data.survey_type === "clinica" ? "Clínica" : "Genérico"}</Badge>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-2">
            <ResponseGrid responses={responses} />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
