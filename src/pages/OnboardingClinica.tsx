import { useState, useId, useRef } from "react";
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
      aria-pressed={selected}
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
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-white/70 text-sm font-medium">{label}</Label>
      <Input
        id={inputId}
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
  const [submitError, setSubmitError] = useState("");
  const responseId = useRef<string | null>(null);

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
    if (!groupId || submitting) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      responseId.current ??= crypto.randomUUID();
      const { error } = await supabase.from("onboarding_responses" as any).insert({
        id: responseId.current,
        group_id: groupId,
        survey_type: isClinica ? "clinica" : "generico",
        respondent_name: isClinica ? (form.clinic_name || null) : (form.business_name || null),
        respondent_email: form.commercial_email || null,
        responses: form,
      } as any);
      // A lost HTTP acknowledgement must not duplicate a form or its notifications.
      if (error && error.code !== "23505") throw error;

      // The database queues follow-ups atomically; closing this page cannot lose them.
      // No client-supplied recipient or group is trusted by the completion endpoint.
      void supabase.functions.invoke("notify-gestor-onboarding", {
        body: { response_id: responseId.current },
      }).catch(() => undefined);

      setSubmitted(true);
    } catch (err) {
      setSubmitError("Não foi possível salvar suas respostas. Seus dados continuam aqui; tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="survey-shell">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,180,220,0.08),transparent_60%)]" />
        <div className="onboarding-surface max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5 ring-2 ring-emerald-400/20">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Onboarding Completo!</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Obrigado por preencher o formulário. Nossa equipe já está trabalhando para criar estratégias personalizadas para você!
          </p>
        </div>
      </div>
    );
  }

  const nextStep = () => {
    if (step === 0) {
      const name = isClinica ? form.clinic_name : form.business_name;
      if (!name?.trim() || !form.responsible_name?.trim()) {
        setSubmitError("Informe o nome do negócio e o nome do responsável para continuar.");
        return;
      }
      if (form.commercial_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.commercial_email)) {
        setSubmitError("Confira o e-mail comercial informado.");
        return;
      }
    }
    setSubmitError("");
    setStep(value => value + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            {isClinica ? (
              [
                { key: "clinic_name", label: "Nome da Clínica *" },
                { key: "cnpj", label: "CNPJ" },
                { key: "responsible_name", label: "Nome do Responsável / Dentista Principal *" },
                { key: "responsible_birthday", label: "Data / Mês de Aniversário do Responsável", placeholder: "Ex: 15/03 ou Março" },
              ].map(({ key, label, placeholder }: any) => (
                <FormInput key={key} label={label} value={form[key] || ""} onChange={(v) => set(key, v)} placeholder={placeholder} />
              ))
            ) : (
              [
                { key: "business_name", label: "Nome da Empresa *" },
                { key: "cnpj", label: "CNPJ" },
                { key: "responsible_name", label: "Nome do Responsável *" },
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
    <div className="onboarding-shell">
      <header className="onboarding-brand"><img src={newvoxLogo} alt="" /><strong>new vox</strong><span>EXPERIÊNCIA DO CLIENTE</span></header>
      <div className="onboarding-layout">
        <aside className="onboarding-guide">
          <span className="login-section-number">O PRIMEIRO PASSO DA NOSSA PARCERIA</span>
          <h1>Vamos conhecer<br />o seu negócio.</h1>
          <p>Suas respostas dão direção à nossa estratégia. Preencha com tranquilidade; você pode voltar às etapas anteriores antes de enviar.</p>
          <ol>{getSteps(isClinica).map((item, index) => <li key={item.label} aria-current={step === index ? "step" : undefined}><span>{index < step ? "✓" : String(index + 1).padStart(2, "0")}</span>{item.label}</li>)}</ol>
        </aside>
        <section className="onboarding-surface" aria-labelledby="onboarding-title">
          <div className="flex items-center justify-between gap-3 mb-4"><span className="login-section-number">ETAPA {step + 1} DE {getSteps(isClinica).length}</span><span className="text-xs text-muted-foreground">{Math.round(((step + 1) / getSteps(isClinica).length) * 100)}%</span></div>
          <div role="progressbar" aria-label="Progresso do onboarding" aria-valuenow={step + 1} aria-valuemin={0} aria-valuemax={getSteps(isClinica).length} className="h-1.5 bg-secondary rounded-full mb-7"><div className="h-full bg-primary rounded-full transition-all" style={{ width: ((step + 1) / getSteps(isClinica).length) * 100 + "%" }} /></div>
          <h2 id="onboarding-title" tabIndex={-1}>{getSteps(isClinica)[step].label}</h2>
          <p className="text-sm text-muted-foreground mt-2">Conte os detalhes que fazem o seu negócio único.</p>
          <div className="onboarding-fields">{renderStep()}</div>
          {submitError && <p role="alert" className="text-sm text-red-700 bg-red-50 p-4 rounded-xl mb-4">{submitError}</p>}
          <div className="flex justify-between gap-3 pt-6 border-t">
            <Button variant="outline" disabled={step === 0 || submitting} onClick={() => setStep(step - 1)}><ChevronLeft size={16} className="mr-2" />Voltar</Button>
            {step < getSteps(isClinica).length - 1 ? <Button onClick={nextStep}>Continuar<ChevronRight size={16} className="ml-2" /></Button> : <Button onClick={handleSubmit} disabled={submitting || !form.terms_accepted}>{submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={16} className="mr-2" />}{submitting ? "Salvando respostas…" : "Concluir onboarding"}</Button>}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-6">Suas respostas serão utilizadas pela equipe New Vox para planejar o atendimento e a estratégia do seu negócio.</p>
        </section>
      </div>
    </div>
  );
}
