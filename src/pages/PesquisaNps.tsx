import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CheckCircle2, Frown, Meh, Smile, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type SurveyType = "operacao" | "clinica";

interface ReferralData {
  name: string;
  company: string;
  contact: string;
}

const QUALITY_OPTIONS_OPERACAO = ["Excelente", "Boa", "Regular", "Ruim"];
const COMMUNICATION_OPTIONS_OPERACAO = [
  "Sim, totalmente",
  "Na maioria das vezes",
  "Poderia melhorar",
  "Não, é insatisfatória",
];
const RESULTS_OPTIONS_OPERACAO = [
  "Superaram minhas expectativas",
  "Atenderam às expectativas",
  "Atenderam parcialmente",
  "Não atenderam",
];
const MANAGER_OPTIONS_OPERACAO = ["Excelente", "Bom", "Regular", "Ruim"];

const RESULTS_OPTIONS_CLINICA = [
  "Sim, aumentou bastante",
  "Sim, aumentou um pouco",
  "Manteve igual",
  "Não percebi diferença",
  "Diminuiu",
];
const QUALITY_OPTIONS_CLINICA = ["Excelente", "Boa", "Regular", "Ruim"];
const UNDERSTANDING_OPTIONS_CLINICA = [
  "Sim, totalmente",
  "Na maioria das vezes",
  "Poderia entender melhor",
  "Não entende",
];
const MANAGER_OPTIONS_CLINICA = [
  "Sim, totalmente",
  "Na maioria das vezes",
  "Poderia melhorar",
  "Não, são insatisfatórios",
];

export default function PesquisaNps() {
  const { groupId, surveyType: surveyTypeParam } = useParams<{
    groupId: string;
    surveyType: string;
  }>();
  const surveyType: SurveyType =
    surveyTypeParam === "clinica" ? "clinica" : "operacao";

  const [step, setStep] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [qualityRating, setQualityRating] = useState("");
  const [qualityRating, setQualityRating] = useState("");
  const [communicationRating, setCommunicationRating] = useState("");
  const [resultsRating, setResultsRating] = useState("");
  const [managerRating, setManagerRating] = useState("");
  const [improvementComment, setImprovementComment] = useState("");
  const [referrals, setReferrals] = useState<ReferralData[]>([
    { name: "", company: "", contact: "" },
    { name: "", company: "", contact: "" },
    { name: "", company: "", contact: "" },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isClinica = surveyType === "clinica";

  const isClinica = surveyType === "clinica";
  const showReferrals = score !== null && score >= 9;

  // Total steps: 0=info+score, 1=motivo, 2=quality, 3=communication, 4=results, 5=manager, 6=improvement, 7=referrals(conditional)
  const totalSteps = showReferrals ? 8 : 7;

  const canAdvance = () => {
    switch (step) {
      case 0:
        return score !== null;
      case 1:
        return comment.trim().length > 0;
      case 2:
        return qualityRating !== "";
      case 3:
        return communicationRating !== "";
      case 4:
        return resultsRating !== "";
      case 5:
        return managerRating !== "";
      case 6:
        return true; // improvement is optional
      case 7:
        return true; // referrals optional
      default:
        return false;
    }
  };

  const isLastStep = () => {
    if (showReferrals) return step === 7;
    return step === 6;
  };

  const handleSubmit = async () => {
    if (score === null) return;
    setLoading(true);
    setError("");

    const insertPayload: Record<string, any> = {
      group_id: groupId,
      score,
      comment: comment.trim() || null,
      respondent_name: null,
      respondent_email: null,
      survey_type: surveyType,
      quality_rating: qualityRating || null,
      communication_rating: communicationRating || null,
      results_rating: resultsRating || null,
      manager_rating: managerRating || null,
      improvement_comment: improvementComment.trim() || null,
      referral_1_name: referrals[0]?.name.trim() || null,
      referral_1_company: referrals[0]?.company.trim() || null,
      referral_1_contact: referrals[0]?.contact.trim() || null,
      referral_2_name: referrals[1]?.name.trim() || null,
      referral_2_company: referrals[1]?.company.trim() || null,
      referral_2_contact: referrals[1]?.contact.trim() || null,
      referral_3_name: referrals[2]?.name.trim() || null,
      referral_3_company: referrals[2]?.company.trim() || null,
      referral_3_contact: referrals[2]?.contact.trim() || null,
    };

    const { error: insertError } = await supabase
      .from("nps_surveys")
      .insert(insertPayload as any);

    if (insertError) {
      setError("Erro ao enviar resposta. Tente novamente.");
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  const handleNext = () => {
    if (isLastStep()) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  };

  const updateReferral = (
    index: number,
    field: keyof ReferralData,
    value: string
  ) => {
    setReferrals((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="bg-card/80 backdrop-blur border border-border/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Obrigado!</h1>
          <p className="text-muted-foreground">
            Sua avaliação foi registrada com sucesso. Agradecemos pelo seu
            feedback!
          </p>
        </div>
      </div>
    );
  }

  const getScoreColor = (s: number) => {
    if (s <= 6) return "bg-red-500 text-white";
    if (s <= 8) return "bg-amber-500 text-white";
    return "bg-emerald-500 text-white";
  };

  const getScoreEmoji = () => {
    if (score === null) return null;
    if (score <= 6) return <Frown className="w-10 h-10 text-red-500" />;
    if (score <= 8) return <Meh className="w-10 h-10 text-amber-500" />;
    return <Smile className="w-10 h-10 text-emerald-500" />;
  };

  const progressPercent = ((step + 1) / totalSteps) * 100;

  const questionLabel = isClinica
    ? "NPS — Clínicas Odontológicas"
    : "NPS — Cliente Ativo";

  const renderRadioOptions = (
    options: string[],
    value: string,
    onChange: (v: string) => void
  ) => (
    <RadioGroup value={value} onValueChange={onChange} className="space-y-2.5">
      {options.map((opt) => (
        <label
          key={opt}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
            value === opt
              ? "border-primary bg-primary/10"
              : "border-border/40 bg-muted/20 hover:border-primary/40"
          )}
        >
          <RadioGroupItem value={opt} />
          <span className="text-sm">{opt}</span>
        </label>
      ))}
    </RadioGroup>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="bg-card/80 backdrop-blur border border-border/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full space-y-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xs font-medium text-primary uppercase tracking-wider">
            {questionLabel}
          </p>
          {groupName && (
            <p className="text-muted-foreground text-sm">{groupName}</p>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted/30 rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step 0 - Score + Info */}
        {step === 0 && (
          <div className="space-y-5">
            <p className="text-sm text-foreground font-medium text-center">
              {isClinica
                ? "Em uma escala de 0 a 10, qual a probabilidade de você recomendar nossa agência para outro dentista ou clínica odontológica?"
                : "Em uma escala de 0 a 10, qual a probabilidade de você recomendar nossa agência para um amigo ou parceiro de negócio?"}
            </p>

            <div className="space-y-3">
              <div className="flex justify-center gap-1.5 flex-wrap">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setScore(i);
                      setError("");
                    }}
                    className={cn(
                      "w-10 h-10 rounded-lg font-bold text-sm transition-all duration-200 border-2",
                      score === i
                        ? cn(
                            getScoreColor(i),
                            "border-transparent scale-110 shadow-lg"
                          )
                        : "bg-muted/50 text-muted-foreground border-border/30 hover:border-primary/50 hover:scale-105"
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                <span>Nada provável</span>
                <span>Extremamente provável</span>
              </div>
              {score !== null && (
                <div className="flex justify-center pt-1">{getScoreEmoji()}</div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Seu nome *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite seu nome"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">
                  E-mail (opcional)
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  maxLength={255}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1 - Motivo da nota */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              Qual o principal motivo da sua nota?
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos o motivo da sua avaliação..."
              rows={4}
              maxLength={2000}
            />
          </div>
        )}

        {/* Step 2 - Quality */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {isClinica
                ? "Como você avalia a qualidade dos conteúdos e materiais criados para a sua clínica?"
                : "Como você avalia a qualidade das entregas da nossa equipe?"}
            </p>
            {renderRadioOptions(
              isClinica ? QUALITY_OPTIONS_CLINICA : QUALITY_OPTIONS_OPERACAO,
              qualityRating,
              setQualityRating
            )}
          </div>
        )}

        {/* Step 3 - Communication */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {isClinica
                ? "Você sente que nossa equipe entende as necessidades do mercado odontológico?"
                : "A comunicação entre nossa agência e sua empresa é clara e eficiente?"}
            </p>
            {renderRadioOptions(
              isClinica
                ? UNDERSTANDING_OPTIONS_CLINICA
                : COMMUNICATION_OPTIONS_OPERACAO,
              communicationRating,
              setCommunicationRating
            )}
          </div>
        )}

        {/* Step 4 - Results */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {isClinica
                ? "As estratégias de marketing têm gerado aumento real no fluxo de pacientes da sua clínica?"
                : "Os resultados das nossas estratégias de marketing têm atendido às suas expectativas?"}
            </p>
            {renderRadioOptions(
              isClinica
                ? RESULTS_OPTIONS_CLINICA
                : RESULTS_OPTIONS_OPERACAO,
              resultsRating,
              setResultsRating
            )}
          </div>
        )}

        {/* Step 5 - Manager */}
        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {isClinica
                ? "A comunicação e o acompanhamento do seu gestor de conta têm sido satisfatórios?"
                : "Como você avalia o suporte e acompanhamento do seu gestor de conta?"}
            </p>
            {renderRadioOptions(
              isClinica ? MANAGER_OPTIONS_CLINICA : MANAGER_OPTIONS_OPERACAO,
              managerRating,
              setManagerRating
            )}
          </div>
        )}

        {/* Step 6 - Improvement */}
        {step === 6 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {isClinica
                ? "O que poderíamos fazer para gerar ainda mais resultados para a sua clínica?"
                : "O que poderíamos fazer para melhorar ainda mais a sua experiência conosco?"}
            </p>
            <Textarea
              value={improvementComment}
              onChange={(e) => setImprovementComment(e.target.value)}
              placeholder="Suas sugestões são muito importantes para nós..."
              rows={4}
              maxLength={2000}
            />
          </div>
        )}

        {/* Step 7 - Referrals (only for 9-10) */}
        {step === 7 && showReferrals && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                🎉 Ficamos muito felizes com a sua avaliação!
              </p>
              <p className="text-xs text-muted-foreground">
                {isClinica
                  ? "Você poderia indicar colegas dentistas ou clínicas que poderiam se beneficiar dos nossos serviços?"
                  : "Você poderia indicar contatos que poderiam se beneficiar dos nossos serviços?"}
              </p>
            </div>
            {referrals.map((ref, i) => (
              <div
                key={i}
                className="bg-muted/20 border border-border/30 rounded-lg p-3 space-y-2"
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  Indicação {i + 1}
                </p>
                <Input
                  placeholder="Nome"
                  value={ref.name}
                  onChange={(e) => updateReferral(i, "name", e.target.value)}
                  maxLength={100}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder={isClinica ? "Clínica" : "Empresa"}
                  value={ref.company}
                  onChange={(e) => updateReferral(i, "company", e.target.value)}
                  maxLength={100}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Telefone ou E-mail"
                  value={ref.contact}
                  onChange={(e) => updateReferral(i, "contact", e.target.value)}
                  maxLength={150}
                  className="h-9 text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={loading || !canAdvance()}
            className="flex-1 h-11 text-sm font-semibold gap-1"
          >
            {loading
              ? "Enviando..."
              : isLastStep()
              ? "Enviar Avaliação"
              : "Próximo"}
            {!isLastStep() && !loading && (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Sua resposta é confidencial e nos ajuda a melhorar nossos serviços.
        </p>
      </div>
    </div>
  );
}
