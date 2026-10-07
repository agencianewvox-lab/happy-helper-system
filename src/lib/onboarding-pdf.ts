import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

export interface OnboardingResponse {
  id?: string;
  created_at: string;
  group_id: string;
  respondent_name: string | null;
  responses: Record<string, unknown>;
  survey_type: string;
}

export const FIELD_LABELS: Record<string, string> = {
  clinic_name: "Nome da clínica",
  business_name: "Nome da empresa",
  cnpj: "CNPJ",
  responsible_name: "Responsável",
  responsible_birthday: "Aniversário do responsável",
  responsible_role: "Cargo",
  whatsapp: "WhatsApp",
  attendant_name: "Atendente WhatsApp",
  instagram: "Instagram",
  website: "Site / Landing Page",
  commercial_email: "E-mail comercial",
  city: "Cidade",
  state: "Estado",
  service_area: "Região / Bairros",
  max_radius_km: "Raio máximo (km)",
  specialties: "Especialidades",
  services_list: "Serviços / Produtos",
  main_treatment: "Tratamento ou serviço principal",
  treatment_reason: "Motivo da escolha",
  avg_ticket: "Ticket médio",
  payment_options: "Condições de pagamento",
  capacity_per_day: "Capacidade por dia",
  monthly_revenue: "Faturamento mensal",
  revenue_goal: "Meta de faturamento",
  management_software: "Software de gestão",
  age_range: "Faixa etária",
  predominant_gender: "Gênero predominante",
  socioeconomic_class: "Classe socioeconômica",
  patient_pains: "Dores do cliente / paciente",
  main_patient_pain: "Principal dor",
  post_treatment_feeling: "Resultado esperado",
  competitors: "Concorrentes",
  references: "Referências",
  differentials: "Diferenciais",
  past_marketing: "Marketing anterior",
  failed_strategies: "O que não funcionou",
  ad_budget: "Investimento em anúncios",
  traffic_goal: "Objetivo do tráfego pago",
  leads_goal: "Meta de leads por mês",
  appointments_goal: "Meta de consultas por mês",
  satisfaction_criteria: "Critério de satisfação",
  three_month_expectation: "Expectativa em 3 meses",
  terms_accepted: "Termos aceitos",
};

const INTERNAL_KEYS = new Set(["responsible_role_outro_active"]);

export function formatOnboardingValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    if (key === "ad_budget") {
      const amount = Number(value[0]);
      return Number.isFinite(amount) ? "R$ " + amount.toLocaleString("pt-BR") : "Não informado";
    }
    return value.length > 0 ? value.map(String).join(", ") : "Não informado";
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function onboardingEntries(responses: Record<string, unknown>) {
  return Object.entries(responses)
    .filter(([key]) => !INTERNAL_KEYS.has(key))
    .map(([key, value]) => ({
      key,
      label: FIELD_LABELS[key] || key.replace(/_/g, " "),
      value: formatOnboardingValue(key, value),
    }));
}

export function onboardingFileName(clientName: string, submittedAt: string): string {
  const slug = clientName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "cliente";
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(submittedAt));
  return "onboarding-" + slug + "-" + date + ".pdf";
}

export function createOnboardingPdfDefinition(response: OnboardingResponse, groupName: string): TDocumentDefinitions {
  const name = response.respondent_name?.trim() || groupName;
  const submittedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(new Date(response.created_at));
  const entries = onboardingEntries(response.responses || {});
  const content: Content[] = [
    { text: "ONBOARDING", color: "#0E7490", bold: true, fontSize: 9, characterSpacing: 2, margin: [0, 0, 0, 8] },
    { text: name, color: "#102A43", bold: true, fontSize: 22, margin: [0, 0, 0, 8] },
    { text: "Formulário " + (response.survey_type === "clinica" ? "de clínica" : "de cliente") + "  •  Respondido em " + submittedAt, color: "#536779", fontSize: 10, margin: [0, 0, 0, 22] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#DCE6EC" }], margin: [0, 0, 0, 18] },
    { text: "RESPOSTAS", color: "#0E7490", bold: true, fontSize: 9, characterSpacing: 1.5, margin: [0, 0, 0, 12] },
  ];

  for (const entry of entries) {
    content.push({
      stack: [
        { text: entry.label.toUpperCase(), color: "#617588", bold: true, fontSize: 8, characterSpacing: 0.6, margin: [0, 0, 0, 4] },
        { text: entry.value, color: "#102A43", fontSize: 10, lineHeight: 1.25 },
      ],
      margin: [0, 0, 0, 13],
    });
  }

  return {
    pageSize: "A4",
    pageMargins: [50, 50, 50, 52],
    defaultStyle: { font: "Roboto" },
    content,
    footer: (page, pages) => ({
      columns: [
        { text: "PAINEL DE CONTROLE  /  NEW VOX", alignment: "left" },
        { text: page + " / " + pages, alignment: "right" },
      ],
      color: "#8293A3", fontSize: 8, margin: [50, 14, 50, 0],
    }),
  };
}

export async function downloadOnboardingPdf(response: OnboardingResponse, groupName: string): Promise<void> {
  const [pdfModule, fontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);
  const pdfMake = pdfModule.default ?? pdfModule;
  const fonts = (fontsModule.default ?? fontsModule) as Record<string, string>;
  const name = response.respondent_name?.trim() || groupName;
  pdfMake.createPdf(createOnboardingPdfDefinition(response, groupName), undefined, undefined, fonts)
    .download(onboardingFileName(name, response.created_at));
}
