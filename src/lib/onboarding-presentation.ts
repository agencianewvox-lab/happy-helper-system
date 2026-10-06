import type { OnboardingResponse } from "./onboarding-pdf";

export interface PresentationFact {
  label: string;
  value: string;
  missing: boolean;
}

export interface PresentationChapter {
  id: string;
  label: string;
  title: string;
  description: string;
  kind: "cover" | "facts" | "agenda";
  facts: PresentationFact[];
}

// Only explicitly selected briefing fields belong in the client-facing deck.
// Never copy arbitrary response keys (credentials, contact data, internal notes).
export function createOnboardingPresentation(response: OnboardingResponse, groupName: string) {
  const answers = response.responses || {};
  const clinic = response.survey_type === "clinica";
  const text = (key: string): string => {
    const value = answers[key];
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim()).join(" · ");
    return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  };
  const fact = (label: string, key: string): PresentationFact => {
    const value = text(key);
    return { label, value: value || "A confirmar na reunião", missing: !value };
  };
  const rawBudget = Array.isArray(answers.ad_budget) ? answers.ad_budget[0] : answers.ad_budget;
  // Locale-formatted free text is preserved, not guessed as a number.
  const budget = typeof rawBudget === "number" && Number.isFinite(rawBudget) && rawBudget >= 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(rawBudget)
    : typeof rawBudget === "string" ? rawBudget.trim() : "";
  const clientName = text(clinic ? "clinic_name" : "business_name") || response.respondent_name?.trim() || groupName;
  const location = [text("city"), text("state")].filter(Boolean).join(" / ");
  const submittedDate = new Date(response.created_at);
  const submittedAt = Number.isNaN(submittedDate.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long", timeZone: "America/Sao_Paulo",
  }).format(submittedDate);
  const chapters: PresentationChapter[] = [
    {
      id: "inicio", label: "Ponto de partida", kind: "cover", title: clientName,
      description: "Seu negócio, nossa próxima construção. Vamos transformar este briefing em uma direção compartilhada.",
      facts: [
        { label: "Seu negócio", value: clinic ? "Clínica" : "Empresa", missing: false },
        { label: "Onde estamos", value: location || "Região a confirmar", missing: !location },
        fact("Prioridade informada", "main_treatment"),
      ],
    },
    {
      id: "direcao", label: "Direção & objetivos", kind: "facts", title: "O que queremos construir.",
      description: "O sucesso começa com uma definição em comum. Estas são as expectativas que você compartilhou.",
      facts: [fact("Objetivo do tráfego", "traffic_goal"), fact("Expectativa em três meses", "three_month_expectation"), fact("Como reconhecer o sucesso", "satisfaction_criteria")],
    },
    {
      id: "publico", label: "Pessoas & contexto", kind: "facts", title: "Quem está do outro lado.",
      description: "Antes de falar de campanhas, precisamos entender quem queremos alcançar e o que importa para essas pessoas.",
      facts: [fact("Faixa etária", "age_range"), fact("Perfil do público", "socioeconomic_class"), fact("Principal necessidade", "main_patient_pain"), fact("Transformação esperada", "post_treatment_feeling")],
    },
    {
      id: "oferta", label: "Oferta & diferenciais", kind: "facts", title: "O valor que vamos comunicar.",
      description: "Seu foco comercial e seus diferenciais orientam a conversa. A abordagem final será validada em conjunto.",
      facts: [fact(clinic ? "Tratamento prioritário" : "Produto ou serviço prioritário", "main_treatment"), fact(clinic ? "Especialidades" : "Produtos e serviços", clinic ? "specialties" : "services_list"), fact("Seus diferenciais", "differentials"), fact("Condições de pagamento", "payment_options")],
    },
    {
      id: "investimento", label: "Investimento & metas", kind: "facts", title: "Clareza para decidir.",
      description: "Valores e expectativas declarados no formulário. Metas são pontos de alinhamento, não garantias de resultado.",
      facts: [
        { label: "Investimento mensal em anúncios", value: budget || "A confirmar na reunião", missing: !budget },
        fact("Ticket médio informado", "avg_ticket"), fact("Meta de leads por mês", "leads_goal"),
        fact(clinic ? "Meta de consultas por mês" : "Meta de atendimentos por mês", "appointments_goal"),
      ],
    },
    {
      id: "operacao", label: "Operação & aprendizado", kind: "facts", title: "Uma operação pronta para responder.",
      description: "A experiência continua depois do anúncio. Vamos alinhar capacidade, atendimento e o que já aprendemos com o passado.",
      facts: [fact(clinic ? "Capacidade de pacientes por dia" : "Capacidade de atendimento por dia", "capacity_per_day"), fact("Região de atendimento", "service_area"), fact("Experiência anterior de marketing", "past_marketing"), fact("O que não funcionou", "failed_strategies")],
    },
    {
      id: "proximos-passos", label: "Próximos passos", kind: "agenda", title: "Da conversa ao próximo passo.",
      description: "Pauta sugerida para esta reunião. Responsáveis, datas e decisões ainda precisam ser confirmados com o cliente.",
      facts: [
        { label: "01 / Direção", value: "Validar o objetivo principal e a oferta prioritária.", missing: false },
        { label: "02 / Viabilidade", value: "Confirmar investimento, capacidade de atendimento e expectativas.", missing: false },
        { label: "03 / Execução", value: "Definir os próximos passos, seus responsáveis e prazos.", missing: false },
        { label: "04 / Memória", value: "Registrar o que foi alinhado no histórico deste cliente.", missing: false },
      ],
    },
  ];
  return { clientName, submittedAt, chapters };
}
