export interface PendingDemandDetail {
  term: string;
  requested_at: string; // ISO timestamp
  message_excerpt: string;
  suggested_solution: string;
  priority: "urgente" | "normal" | "baixa";
  hours_waiting: number;
  confidence: "alta" | "media";
  category: "confirmada" | "possivel";
}

export interface ChurnDriver {
  label: string;
  points: number;
}

export type SentimentTrend = "melhorando" | "piorando" | "estavel";

export type IntentCategory = "Aprovação" | "Suporte Técnico" | "Financeiro" | "Urgência" | "Informativo" | null;

export type PriorityLevel = "maxima" | "alta" | "normal" | null;

export interface GroupAnalytics {
  group_id: string;
  avg_frt_minutes: number | null;
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number;
  sentiment_trend: SentimentTrend;
  critical_terms: string[];
  complaint_count: number;
  complaint_terms: string[];
  positive_count: number;
  demand_count: number;
  engagement_type: "saudável" | "cobrança" | "misto" | "inativo";
  churn_risk: number;
  churn_risk_label: "baixo" | "moderado" | "alto" | "crítico";
  churn_drivers: ChurnDriver[];
  total_client_msgs: number;
  total_team_msgs: number;
  has_pending_demands: boolean;
  pending_demand_terms: string[];
  pending_demand_details?: PendingDemandDetail[];
  intent?: IntentCategory;
  priority_level: PriorityLevel;
  priority_reason: string | null;
}

export interface CoachMessage {
  id: string;
  destinatario_nome: string;
  destinatario_telefone?: string;
  mensagem: string;
  tipo: string;
  group_id?: string;
  enviada: boolean;
  enviada_em?: string;
  resultado?: string;
  created_at: string;
}

export interface CoachConfig {
  id: string;
  ativo: boolean;
  horario_inicio: string;
  horario_fim: string;
  max_mensagens_dia_por_pessoa: number;
  intervalo_minimo_minutos: number;
  tom: string;
  tipos_ativos: string[];
}

export const COACH_TYPE_LABELS: Record<string, string> = {
  grupo_parado: "Grupo parado",
  sentimento_caindo: "Sentimento caindo",
  pendencia_esquecida: "Pendência esquecida",
  frt_alto: "FRT alto",
  cliente_elogiou: "Cliente elogiou",
  aniversario: "Aniversário/data",
  ads_decolou: "Ads decolou",
  ads_caiu: "Ads caiu",
  onboarding_travou: "Onboarding travou",
  parabens_performance: "Parabéns performance",
  cliente_novo: "Cliente novo",
  padrao_detectado: "Padrão detectado",
};

export interface Grupo {
  id: string;
  group_id: string;
  nome: string;
  categoria: string | null;
  created_at: string;
  total_mensagens: number;
  mensagens_hoje: number;
  ultima_mensagem: string | null;
  ultimo_horario: string | null;
  analytics?: GroupAnalytics;
  /** True when last message is from client and team hasn't responded in 30+ biz minutes */
  sla_violated: boolean;
  /** Minutes of delay beyond the 30-min SLA threshold */
  sla_delay_minutes: number;
  investimento_ads: number | null;
  data_ciclo_ads: string | null;
  gestor_responsavel: string | null;
}

export interface NpsDimensionScore {
  nome: string;
  score: number;
  peso: number;
  detalhes: string;
}

export interface NpsPrediction {
  group_id: string;
  nps_score: number;
  nps_categoria: "promotor" | "neutro" | "detrator";
  confianca: number;
  fatores_positivos: Array<{ fator: string; dimensao: string; impacto: number }>;
  fatores_negativos: Array<{ fator: string; dimensao: string; impacto: number }>;
  fator_principal: string;
  recomendacao: string;
  tendencia: "subindo" | "estavel" | "caindo";
  score_anterior: number | null;
  dimension_scores: NpsDimensionScore[];
  calculated_at: string;
}
