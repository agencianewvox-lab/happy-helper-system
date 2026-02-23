export type Satisfacao = "positivo" | "neutro" | "negativo";
export type RiscoChurn = "baixo" | "medio" | "alto";

export interface Cliente {
  id: string;
  nome: string;
  satisfacao: Satisfacao;
  sentimento: string;
  conversas_iniciadas: number;
  nota_gestor: number;
  risco_churn: RiscoChurn;
  tempo_medio_resposta: string;
  demandas: string;
  entregas: string;
  falhas_gargalos: string;
  oportunidades: string;
  acao_recomendada: string;
}

export interface RelatorioCS {
  clientes: Cliente[];
}
