import { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SPECIALTIES = [
  "Implantes", "Protocolo", "Prótese", "Ortodontia", "Alinhador",
  "Facetas", "Clareamento", "Canal", "Gengiva", "Odontopediatria",
  "Cirurgia Oral", "Harmonização", "Botox", "Clínico Geral",
];

const PAYMENT_OPTIONS = [
  "PIX", "Cartão Parcelado", "Financiamento Próprio", "Financeira Parceira", "Convênio",
];

const PATIENT_PAINS = [
  "Vergonha de sorrir", "Dificuldade para comer", "Dentes amarelados",
  "Sorriso imperfeito", "Perda de dentes", "Medo da dentadura",
  "Insegurança social", "Dor de dente", "Medo do dentista", "Custo do tratamento",
];

const DIFFERENTIALS = [
  "Atendimento humanizado", "Tecnologia avançada", "Carga imediata",
  "Mesmo dentista", "Parcelamento fácil", "Alta especialização",
  "Localização", "Ambiente acolhedor", "Preço acessível", "Alta reputação",
];

const STEPS = [
  "Dados da Clínica",
  "Especialidades & Serviços",
  "Estrutura & Negócio",
  "Público-Alvo",
  "Concorrência & Posicionamento",
  "Investimento & Expectativas",
];

export default function OnboardingClinica() {
  const { groupId } = useParams();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<Record<string, any>>({
    specialties: [] as string[],
    payment_options: [] as string[],
    patient_pains: [] as string[],
    differentials: [] as string[],
    ad_budget: [2000],
    terms_accepted: false,
  });

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleArray = (key: string, value: string) => {
    setForm((prev) => {
      const arr: string[] = prev[key] || [];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v: string) => v !== value) : [...arr, value] };
    });
  };

  const handleSubmit = async () => {
    if (!groupId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("onboarding_responses" as any).insert({
        group_id: groupId,
        survey_type: "clinica",
        respondent_name: form.clinic_name || null,
        respondent_email: form.commercial_email || null,
        responses: form,
      } as any);
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full text-center border border-white/20">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Onboarding Completo!</h2>
          <p className="text-white/70">Obrigado por preencher o formulário. Vamos começar a trabalhar para você!</p>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">📋 Dados da Clínica</h3>
            {[
              { key: "clinic_name", label: "Nome da Clínica" },
              { key: "cnpj", label: "CNPJ" },
              { key: "responsible_name", label: "Nome do Responsável / Dentista Principal" },
              { key: "responsible_role", label: "Cargo do Responsável" },
              { key: "whatsapp", label: "WhatsApp para Atendimento de Pacientes" },
              { key: "attendant_name", label: "Nome do(a) Atendente no WhatsApp" },
              { key: "instagram", label: "Instagram da Clínica" },
              { key: "website", label: "Site / Landing Page (se tiver)" },
              { key: "commercial_email", label: "E-mail Comercial" },
              { key: "city", label: "Cidade" },
              { key: "state", label: "Estado" },
              { key: "service_area", label: "Região / Bairros de Atendimento" },
              { key: "max_radius_km", label: "Raio máximo de atendimento (km)", type: "number" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <Label className="text-white/80 text-sm">{label}</Label>
                <Input
                  type={type || "text"}
                  value={form[key] || ""}
                  onChange={(e) => set(key, e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
              </div>
            ))}
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">🦷 Especialidades & Serviços</h3>
            <div>
              <Label className="text-white/80 text-sm">Quais especialidades a clínica oferece?</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {SPECIALTIES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                    <Checkbox checked={(form.specialties || []).includes(s)} onCheckedChange={() => toggleArray("specialties", s)} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-white/80 text-sm">Qual tratamento você MAIS quer divulgar?</Label>
              <Input value={form.main_treatment || ""} onChange={(e) => set("main_treatment", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">Por que esse tratamento? O que ele representa para sua clínica?</Label>
              <Textarea value={form.treatment_reason || ""} onChange={(e) => set("treatment_reason", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">Ticket Médio Atual</Label>
              <Input value={form.avg_ticket || ""} onChange={(e) => set("avg_ticket", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">Condições de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {PAYMENT_OPTIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                    <Checkbox checked={(form.payment_options || []).includes(p)} onCheckedChange={() => toggleArray("payment_options", p)} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">🏥 Estrutura & Negócio</h3>
            {[
              { key: "capacity_per_day", label: "Capacidade de Atendimento (pacientes/dia)", type: "number" },
              { key: "monthly_revenue", label: "Faturamento Mensal Médio" },
              { key: "revenue_goal", label: "Meta de Faturamento Mensal (com marketing)" },
              { key: "management_software", label: "Software de gestão / CRM de pacientes?" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <Label className="text-white/80 text-sm">{label}</Label>
                <Input type={type || "text"} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} className="bg-white/10 border-white/20 text-white" />
              </div>
            ))}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">👥 Público-Alvo</h3>
            {[
              { key: "age_range", label: "Faixa etária predominante" },
              { key: "predominant_gender", label: "Gênero predominante" },
              { key: "socioeconomic_class", label: "Classe socioeconômica do paciente ideal" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-white/80 text-sm">{label}</Label>
                <Input value={form[key] || ""} onChange={(e) => set(key, e.target.value)} className="bg-white/10 border-white/20 text-white" />
              </div>
            ))}
            <div>
              <Label className="text-white/80 text-sm">Principais dores do seu paciente que você resolve</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {PATIENT_PAINS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                    <Checkbox checked={(form.patient_pains || []).includes(p)} onCheckedChange={() => toggleArray("patient_pains", p)} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-white/80 text-sm">Na sua visão: qual a principal dor do seu paciente?</Label>
              <Textarea value={form.main_patient_pain || ""} onChange={(e) => set("main_patient_pain", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">O que o paciente ganha / sente depois do tratamento?</Label>
              <Textarea value={form.post_treatment_feeling || ""} onChange={(e) => set("post_treatment_feeling", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">🏆 Concorrência & Posicionamento</h3>
            <div>
              <Label className="text-white/80 text-sm">Principais concorrentes da clínica</Label>
              <Textarea value={form.competitors || ""} onChange={(e) => set("competitors", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">3 referências / inspirações no segmento odontológico</Label>
              <Textarea value={form.references || ""} onChange={(e) => set("references", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">Maiores diferenciais em relação à concorrência</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {DIFFERENTIALS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                    <Checkbox checked={(form.differentials || []).includes(d)} onCheckedChange={() => toggleArray("differentials", d)} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-white/80 text-sm">Estratégias de marketing já utilizadas</Label>
              <Textarea value={form.past_marketing || ""} onChange={(e) => set("past_marketing", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">O que já tentou e NÃO funcionou? Por quê?</Label>
              <Textarea value={form.failed_strategies || ""} onChange={(e) => set("failed_strategies", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">💰 Investimento & Expectativas</h3>
            <div>
              <Label className="text-white/80 text-sm">Investimento mensal em anúncios: R$ {(form.ad_budget?.[0] || 2000).toLocaleString("pt-BR")}</Label>
              <Slider
                value={form.ad_budget || [2000]}
                onValueChange={(v) => set("ad_budget", v)}
                min={500}
                max={20000}
                step={500}
                className="mt-2"
              />
              <div className="flex justify-between text-[10px] text-white/40 mt-1">
                <span>R$ 500</span>
                <span>R$ 20.000</span>
              </div>
            </div>
            <div>
              <Label className="text-white/80 text-sm">Principal objetivo com tráfego pago</Label>
              <Textarea value={form.traffic_goal || ""} onChange={(e) => set("traffic_goal", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            {[
              { key: "leads_goal", label: "Meta de leads por mês" },
              { key: "appointments_goal", label: "Meta de consultas / avaliações por mês" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-white/80 text-sm">{label}</Label>
                <Input value={form[key] || ""} onChange={(e) => set(key, e.target.value)} className="bg-white/10 border-white/20 text-white" />
              </div>
            ))}
            <div>
              <Label className="text-white/80 text-sm">O que te deixaria extremamente satisfeito com o nosso trabalho?</Label>
              <Textarea value={form.satisfaction_criteria || ""} onChange={(e) => set("satisfaction_criteria", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <div>
              <Label className="text-white/80 text-sm">O que você espera nos primeiros 3 meses de parceria?</Label>
              <Textarea value={form.three_month_expectation || ""} onChange={(e) => set("three_month_expectation", e.target.value)} className="bg-white/10 border-white/20 text-white" />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer mt-4 p-3 rounded-lg bg-white/5 border border-white/20">
              <Checkbox checked={form.terms_accepted || false} onCheckedChange={(v) => set("terms_accepted", !!v)} />
              Aceito o termo de autorização para início dos trabalhos de marketing digital.
            </label>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 sm:p-8 max-w-xl w-full border border-white/20">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">🦷 Onboarding — Clínica</h1>
          <p className="text-white/60 text-sm mt-1">Etapa {step + 1} de {STEPS.length} — {STEPS[step]}</p>
          <div className="flex gap-1 mt-3">
            {STEPS.map((_, i) => (
              <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-blue-400" : "bg-white/20")} />
            ))}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1">{renderStep()}</div>

        <div className="flex justify-between mt-6">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} className="text-white/70 hover:text-white">
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} className="bg-blue-500 hover:bg-blue-600 text-white">
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || !form.terms_accepted} className="bg-emerald-500 hover:bg-emerald-600 text-white">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Enviar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
