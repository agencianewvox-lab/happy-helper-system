import type { OnboardingResponse } from "./onboarding-pdf";
import { ACCESS_ITEMS, ACCESS_LABELS, emptyMeetingPlan, type MeetingPlan } from "./onboarding-plan";

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
export function createOnboardingPresentation(response: OnboardingResponse, groupName: string, plan: MeetingPlan = emptyMeetingPlan()) {
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
      description: "Nossa parceria começa com clareza. Hoje vamos alinhar prioridades, preparar os acessos e definir o caminho entre a estratégia e os primeiros resultados.",
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
  const plannedFact = (label: string, value: string, fallback: string): PresentationFact => ({ label, value: value.trim() || fallback, missing: !value.trim() });
  chapters.splice(6, 0,
    {
      id: "plano", label: "Plano de trabalho", kind: "agenda", title: "Estratégia com uma direção clara.",
      description: "Vamos combinar o que será feito e os critérios de sucesso. O briefing orienta a conversa; escopo e metas precisam ser validados juntos.",
      facts: [
        plannedFact("Foco desta parceria", plan.focus, text("traffic_goal") || "Definir a prioridade comercial e a região de atuação."),
        plannedFact("Escopo e entregas", plan.scope, "Confirmar os serviços contratados, canais, entregas e limites do projeto."),
        plannedFact("Como vamos medir", plan.measurement, "Acompanhar investimento, contatos qualificados, agendamentos e vendas. Estabelecer metas após validar a operação e os dados."),
        { label: "Método Newvox / proposta", value: "Diagnosticar → preparar → ativar → medir → melhorar. O início das campanhas depende de acessos, materiais, verba e aprovações.", missing: false },
      ],
    },
    {
      id: "acessos", label: "Acessos & preparação", kind: "agenda", title: "Preparar antes de acelerar.",
      description: "Liberação por convite e permissões oficiais. Nunca envie senhas, códigos de autenticação ou tokens pelo formulário ou nesta apresentação.",
      facts: ACCESS_ITEMS.map((item) => ({ label: `${item.label} · ${ACCESS_LABELS[plan.access[item.id] || "pending"]}`, value: item.detail, missing: !plan.access[item.id] || plan.access[item.id] === "pending" })),
    },
    {
      id: "rotina", label: "Pessoas & rotina", kind: "agenda", title: "Cada responsabilidade, no seu lugar.",
      description: "Uma boa parceria precisa de responsáveis, comunicação previsível e um atendimento preparado para receber os contatos.",
      facts: [
        plannedFact("Ponto focal Newvox", plan.agencyOwner, "Definir o gestor responsável pela execução e pelo acompanhamento."),
        plannedFact("Ponto focal do cliente", plan.clientOwner, "Definir quem aprova materiais, libera acessos e acompanha o atendimento."),
        plannedFact("Comunicação e acompanhamento", plan.cadence, "Combinar canal oficial, disponibilidade, frequência de atualizações e próxima reunião."),
        { label: "Do contato ao resultado", value: "Newvox acompanha mídia e oportunidades. O cliente mantém o atendimento e o retorno sobre agendamentos, comparecimentos e vendas. Validaremos essa divisão na reunião.", missing: false },
      ],
    },
  );
  chapters[chapters.length - 1] = {
    id: "proximos-passos", label: "Próximos passos", kind: "agenda", title: "Saímos daqui com um plano.",
    description: "Responsáveis, datas e decisões precisam ser confirmados na reunião. A apresentação não agenda tarefas nem envia mensagens automaticamente.",
    facts: [
      plannedFact("Plano de ação", plan.milestones, "01 · Cliente + Newvox: validar foco, escopo e investimento.\n02 · Cliente: liberar acessos e materiais.\n03 · Newvox: conferir mensuração e preparar campanhas.\n04 · Cliente: aprovar materiais e ativação.\n05 · Ambos: revisar os primeiros dados e próximos ajustes.\nDatas e responsáveis: a combinar."),
      plannedFact("Decisões registradas", plan.decisions, "Registrar ao final o que foi aprovado, as pendências e a data do próximo encontro."),
    ],
  };
  return { clientName, submittedAt, chapters };
}

export type OnboardingDeck = ReturnType<typeof createOnboardingPresentation>;
