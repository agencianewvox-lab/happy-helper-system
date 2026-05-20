import { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import newvoxLogo from "@/assets/newvox-logo.jpg";

const RESPONSIBLE_ROLES = [
  "Proprietário(a)",
  "Cirurgião(ã)-Dentista",
  "Gestor(a) / Administrador(a)",
  "Sócio(a)",
  "Outro",
];

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

const AGE_RANGES = ["18-25", "26-35", "36-45", "46-55", "56-65", "65+"];
const GENDERS = ["Feminino", "Masculino", "Ambos igualmente"];
const SOCIO_CLASSES = ["Classe A", "Classe B", "Classe C", "Classes D/E", "Misto"];

  const getSteps = (clinica: boolean) => [
    { label: clinica ? "Dados da Clínica" : "Dados da Empresa", icon: "📋" },
    { label: clinica ? "Especialidades & Serviços" : "Produtos & Serviços", icon: "⚕️" },
    { label: "Estrutura & Negócio", icon: "🏥" },
    { label: "Público-Alvo", icon: "👥" },
    { label: "Concorrência", icon: "🏆" },
    { label: "Investimento", icon: "💰" },
  ];

function SelectableChip({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 border",
        selected
          ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-300 shadow-[0_0_12px_rgba(0,200,255,0.15)]"
          : "bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white/80"
      )}
    >
      {label}
    </button>
  );
}

function RadioOption({ value, label, selected }: { value: string; label: string; selected: boolean }) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200",
        selected
          ? "bg-cyan-500/15 border-cyan-400/50 shadow-[0_0_12px_rgba(0,200,255,0.1)]"
          : "bg-white/5 border-white/10 hover:border-white/25"
      )}
    >
      <RadioGroupItem value={value} className="border-white/30 text-cyan-400" />
      <span className={cn("text-sm", selected ? "text-cyan-300" : "text-white/70")}>{label}</span>
    </label>
  );
}

function FormInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-white/70 text-sm font-medium">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-cyan-400/50 focus:ring-cyan-400/20 h-11 rounded-xl"
      />
    </div>
  );
}

export default function OnboardingClinica() {
  const { groupId, surveyType } = useParams();
  const isClinica = surveyType === "clinica";
  
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
        survey_type: isClinica ? "clinica" : "generico",
        respondent_name: isClinica ? (form.clinic_name || null) : (form.business_name || null),
        respondent_email: form.commercial_email || null,
        responses: form,
      } as any);
      if (error) throw error;

      // If role is Proprietário or Sócio, auto-fill client card
      const role = form.responsible_role || "";
      const isOwnerOrPartner = role === "Proprietário(a)" || role === "Sócio(a)";
      
      // Always try to update card data and lookup CNPJ via edge function
      try {
        await supabase.functions.invoke("cnpj-lookup", {
          body: { 
            cnpj: form.cnpj || null, 
            group_id: groupId,
            is_owner_or_partner: isOwnerOrPartner,
            responsible_name: form.responsible_name || null,
            responsible_birthday: form.responsible_birthday || null,
          },
        });
      } catch (cnpjErr) {
        console.error("Auto-fill failed:", cnpjErr);
      }

      // Notify gestor via WhatsApp and create onboarding call task
      try {
        await supabase.functions.invoke("notify-gestor-onboarding", {
          body: { group_id: groupId, client_name: form.clinic_name || null },
        });
      } catch (notifyErr) {
        console.error("Gestor notification failed:", notifyErr);
      }

      setSubmitted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,180,220,0.08),transparent_60%)]" />
        <div className="relative bg-white/[0.04] backdrop-blur-xl rounded-3xl p-10 max-w-md w-full text-center border border-white/[0.06] shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5 ring-2 ring-emerald-400/20">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Onboarding Completo!</h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Obrigado por preencher o formulário. Nossa equipe já está trabalhando para criar estratégias personalizadas para você!
          </p>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            {isClinica ? (
              [
                { key: "clinic_name", label: "Nome da Clínica" },
                { key: "cnpj", label: "CNPJ" },
                { key: "responsible_name", label: "Nome do Responsável / Dentista Principal" },
                { key: "responsible_birthday", label: "Data / Mês de Aniversário do Responsável", placeholder: "Ex: 15/03 ou Março" },
              ].map(({ key, label, placeholder }: any) => (
                <FormInput key={key} label={label} value={form[key] || ""} onChange={(v) => set(key, v)} placeholder={placeholder} />
              ))
            ) : (
              [
                { key: "business_name", label: "Nome da Empresa" },
                { key: "cnpj", label: "CNPJ" },
                { key: "responsible_name", label: "Nome do Responsável" },
                { key: "responsible_birthday", label: "Data / Mês de Aniversário do Responsável", placeholder: "Ex: 15/03 ou Março" },
              ].map(({ key, label, placeholder }: any) => (
                <FormInput key={key} label={label} value={form[key] || ""} onChange={(v) => set(key, v)} placeholder={placeholder} />
              ))
            )}
            {/* Cargo do Responsável - selectable chips */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Cargo do Responsável</Label>
              <div className="flex flex-wrap gap-2">
                {RESPONSIBLE_ROLES.map((role) => (
                  <SelectableChip
                    key={role}
                    label={role}
                    selected={form.responsible_role === role || (role === "Outro" && form.responsible_role_outro_active)}
                    onClick={() => {
                      if (role === "Outro") {
                        set("responsible_role_outro_active", true);
                        set("responsible_role", "");
                      } else {
                        set("responsible_role_outro_active", false);
                        set("responsible_role", role);
                      }
                    }}
                  />
                ))}
              </div>
              {form.responsible_role_outro_active && (
                <FormInput
                  label="Especifique o cargo"
                  value={form.responsible_role || ""}
                  onChange={(v) => set("responsible_role", v)}
                  placeholder="Digite o cargo"
                />
              )}
            </div>
            {[
              { key: "whatsapp", label: isClinica ? "WhatsApp para Atendimento de Pacientes" : "WhatsApp de Atendimento" },
              { key: "attendant_name", label: "Nome do(a) Atendente no WhatsApp" },
              { key: "instagram", label: isClinica ? "Instagram da Clínica" : "Instagram da Empresa" },
              { key: "website", label: "Site / Landing Page (se tiver)" },
              { key: "commercial_email", label: "E-mail Comercial" },
              { key: "city", label: "Cidade" },
              { key: "state", label: "Estado" },
              { key: "service_area", label: "Região / Bairros de Atendimento" },
              { key: "max_radius_km", label: "Raio máximo de atendimento (km)", type: "number" },
            ].map(({ key, label, type }) => (
              <FormInput key={key} label={label} value={form[key] || ""} onChange={(v) => set(key, v)} type={type} />
            ))}
          </div>
        );
      case 1:
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">{isClinica ? "Quais especialidades a clínica oferece?" : "Quais serviços/produtos sua empresa oferece?"}</Label>
              {isClinica ? (
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => (
                    <SelectableChip key={s} label={s} selected={(form.specialties || []).includes(s)} onClick={() => toggleArray("specialties", s)} />
                  ))}
                </div>
              ) : (
                <Textarea 
                  placeholder="Liste seus principais produtos ou serviços..."
                  value={form.services_list || ""} 
                  onChange={(e) => set("services_list", e.target.value)} 
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl focus:border-cyan-400/50" 
                />
              )}
            </div>
            <FormInput label="Qual serviço/produto você MAIS quer divulgar?" value={form.main_treatment || ""} onChange={(v) => set("main_treatment", v)} />
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">Por que este?</Label>
              <Textarea value={form.treatment_reason || ""} onChange={(e) => set("treatment_reason", e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl focus:border-cyan-400/50" />
            </div>
            <FormInput label="Ticket Médio Atual" value={form.avg_ticket || ""} onChange={(v) => set("avg_ticket", v)} />
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Condições de Pagamento</Label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_OPTIONS.map((p) => (
                  <SelectableChip key={p} label={p} selected={(form.payment_options || []).includes(p)} onClick={() => toggleArray("payment_options", p)} />
                ))}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            {[
              { key: "capacity_per_day", label: isClinica ? "Capacidade de Atendimento (pacientes/dia)" : "Capacidade de Atendimento (clientes/dia)", type: "number" },
              { key: "monthly_revenue", label: "Faturamento Mensal Médio" },
              { key: "revenue_goal", label: "Meta de Faturamento Mensal (com marketing)" },
              { key: "management_software", label: isClinica ? "Software de gestão / CRM de pacientes?" : "Software de gestão / CRM?" },
            ].map(({ key, label, type }) => (
              <FormInput key={key} label={label} value={form[key] || ""} onChange={(v) => set(key, v)} type={type} />
            ))}
          </div>
        );
      case 3:
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Faixa etária predominante</Label>
              <div className="flex flex-wrap gap-2">
                {AGE_RANGES.map((a) => (
                  <SelectableChip key={a} label={a} selected={form.age_range === a} onClick={() => set("age_range", a)} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Gênero predominante</Label>
              <RadioGroup value={form.predominant_gender || ""} onValueChange={(v) => set("predominant_gender", v)} className="space-y-2">
                {GENDERS.map((g) => (
                  <RadioOption key={g} value={g} label={g} selected={form.predominant_gender === g} />
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">{isClinica ? "Classe socioeconômica do paciente ideal" : "Classe socioeconômica do cliente ideal"}</Label>
              <div className="flex flex-wrap gap-2">
                {SOCIO_CLASSES.map((c) => (
                  <SelectableChip key={c} label={c} selected={form.socioeconomic_class === c} onClick={() => set("socioeconomic_class", c)} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">{isClinica ? "Principais dores do paciente que você resolve" : "Principais dores/problemas do seu cliente que você resolve"}</Label>
              <div className="flex flex-wrap gap-2">
                {(isClinica ? PATIENT_PAINS : ["Preço", "Prazo", "Qualidade", "Confiança", "Suporte", "Atendimento", "Praticidade"]).map((p) => (
                  <SelectableChip key={p} label={p} selected={(form.patient_pains || []).includes(p)} onClick={() => toggleArray("patient_pains", p)} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">{isClinica ? "Na sua visão: qual a principal dor do seu paciente?" : "Na sua visão: qual a principal dor do seu cliente?"}</Label>
              <Textarea value={form.main_patient_pain || ""} onChange={(e) => set("main_patient_pain", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">{isClinica ? "O que o paciente ganha / sente depois do tratamento?" : "O que o cliente ganha / sente depois de contratar você?"}</Label>
              <Textarea value={form.post_treatment_feeling || ""} onChange={(e) => set("post_treatment_feeling", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">{isClinica ? "Principais concorrentes da clínica" : "Principais concorrentes da sua empresa"}</Label>
              <Textarea value={form.competitors || ""} onChange={(e) => set("competitors", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">3 referências / inspirações no segmento</Label>
              <Textarea value={form.references || ""} onChange={(e) => set("references", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Maiores diferenciais</Label>
              <div className="flex flex-wrap gap-2">
                {DIFFERENTIALS.map((d) => (
                  <SelectableChip key={d} label={d} selected={(form.differentials || []).includes(d)} onClick={() => toggleArray("differentials", d)} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">Estratégias de marketing já utilizadas</Label>
              <Textarea value={form.past_marketing || ""} onChange={(e) => set("past_marketing", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">O que já tentou e NÃO funcionou? Por quê?</Label>
              <Textarea value={form.failed_strategies || ""} onChange={(e) => set("failed_strategies", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">
                Investimento mensal em anúncios: <span className="text-cyan-400 font-semibold">R$ {(form.ad_budget?.[0] || 2000).toLocaleString("pt-BR")}</span>
              </Label>
              <Slider
                value={form.ad_budget || [2000]}
                onValueChange={(v) => set("ad_budget", v)}
                min={500}
                max={20000}
                step={500}
                className="mt-2"
              />
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                <span>R$ 500</span>
                <span>R$ 20.000</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">Principal objetivo com tráfego pago</Label>
              <Textarea value={form.traffic_goal || ""} onChange={(e) => set("traffic_goal", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            {[
              { key: "leads_goal", label: "Meta de leads por mês" },
              { key: "appointments_goal", label: "Meta de consultas / avaliações por mês" },
            ].map(({ key, label }) => (
              <FormInput key={key} label={label} value={form[key] || ""} onChange={(v) => set(key, v)} />
            ))}
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">O que te deixaria extremamente satisfeito com o nosso trabalho?</Label>
              <Textarea value={form.satisfaction_criteria || ""} onChange={(e) => set("satisfaction_criteria", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-sm font-medium">O que você espera nos primeiros 3 meses de parceria?</Label>
              <Textarea value={form.three_month_expectation || ""} onChange={(e) => set("three_month_expectation", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-cyan-400/50" />
            </div>
            <label className="flex items-center gap-3 text-sm text-white/70 cursor-pointer mt-4 p-4 rounded-xl bg-cyan-500/5 border border-cyan-400/20 hover:border-cyan-400/40 transition-colors">
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
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,200,255,0.07),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(0,150,255,0.05),transparent_50%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

      <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-3xl p-6 sm:p-8 max-w-xl w-full border border-white/[0.06] shadow-[0_20px_80px_-20px_rgba(0,200,255,0.08)]">
        {/* Logo + Header */}
        <div className="text-center mb-6">
          <img src={newvoxLogo} alt="New Vox" className="h-14 mx-auto mb-4 rounded-lg" />
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-lg">{getSteps(isClinica)[step].icon}</span>
            <h2 className="text-lg font-semibold text-white">{getSteps(isClinica)[step].label}</h2>
          </div>
          <p className="text-white/40 text-xs">Etapa {step + 1} de {getSteps(isClinica).length}</p>

          {/* Progress */}
          <div className="flex gap-1.5 mt-4">
            {getSteps(isClinica).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-all duration-500",
                  i < step ? "bg-cyan-400" : i === step ? "bg-cyan-400/70 animate-pulse" : "bg-white/[0.08]"
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[58vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-white/[0.06]">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            className="text-white/50 hover:text-white hover:bg-white/5 rounded-xl"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          {step < getSteps(isClinica).length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-xl shadow-[0_4px_20px_-4px_rgba(0,200,255,0.3)] transition-all"
            >
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !form.terms_accepted}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl shadow-[0_4px_20px_-4px_rgba(0,200,100,0.3)]"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Enviar
            </Button>
          )}
        </div>

        <p className="text-[10px] text-white/20 text-center mt-4">
          Suas respostas são confidenciais e nos ajudam a criar a melhor estratégia para você.
        </p>
      </div>
    </div>
  );
}
