export interface PendingDemandDetail {
  term: string;
  requested_at: string; // ISO timestamp
  message_excerpt: string;
  suggested_solution: string;
}

export interface ChurnBreakdown {
  base: number;
  dissatisfaction: number;
  complaints: number;
  demands: number;
  positive: number;
  frt: number;
  no_response: number;
  inactivity: number;
}

export type IntentCategory = "Aprovação" | "Suporte Técnico" | "Financeiro" | "Urgência" | "Informativo" | null;

export interface GroupAnalytics {
  group_id: string;
  avg_frt_minutes: number | null;
  sentiment: "positivo" | "neutro" | "negativo";
  sentiment_score: number;
  complaint_count: number;
  complaint_terms: string[];
  positive_count: number;
  demand_count: number;
  engagement_type: "saudável" | "cobrança" | "misto" | "inativo";
  churn_risk: number;
  churn_breakdown?: ChurnBreakdown;
  total_client_msgs: number;
  total_team_msgs: number;
  has_pending_demands: boolean;
  pending_demand_terms: string[];
  pending_demand_details?: PendingDemandDetail[];
  intent?: IntentCategory;
}

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
}
