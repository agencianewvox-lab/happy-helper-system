import { useState, useEffect, useCallback } from "react";
import { Cliente, RelatorioCS } from "@/types/client";

const API_URL = "https://SEU-ENDPOINT-DO-N8N/relatorio-cs";
const POLL_INTERVAL = 5000;

// Mock data for development
const mockData: Cliente[] = [
  {
    id: "1",
    nome: "TechCorp Solutions",
    satisfacao: "positivo",
    sentimento: "Muito satisfeito com os resultados",
    conversas_iniciadas: 12,
    nota_gestor: 9,
    risco_churn: "baixo",
    tempo_medio_resposta: "2h 15min",
    demandas: "Campanha de mídia paga e SEO",
    entregas: "3 campanhas ativas, 15 posts publicados",
    falhas_gargalos: "Nenhuma falha identificada",
    oportunidades: "Expansão para LinkedIn Ads",
    acao_recomendada: "Propor upsell de gestão de LinkedIn",
  },
  {
    id: "2",
    nome: "Moda Express",
    satisfacao: "neutro",
    sentimento: "Aguardando resultados do último mês",
    conversas_iniciadas: 3,
    nota_gestor: 6,
    risco_churn: "medio",
    tempo_medio_resposta: "8h 30min",
    demandas: "Gestão de redes sociais e tráfego pago",
    entregas: "2 campanhas ativas, 8 posts publicados",
    falhas_gargalos: "Atraso na entrega de criativos",
    oportunidades: "E-mail marketing para base existente",
    acao_recomendada: "Reunião de alinhamento urgente",
  },
  {
    id: "3",
    nome: "Restaurante Sabor & Arte",
    satisfacao: "negativo",
    sentimento: "Insatisfeito com o tempo de resposta",
    conversas_iniciadas: 0,
    nota_gestor: 4,
    risco_churn: "alto",
    tempo_medio_resposta: "24h",
    demandas: "Google Ads e gestão de avaliações",
    entregas: "1 campanha pausada",
    falhas_gargalos: "Sem contato há 2 semanas",
    oportunidades: "Programa de fidelidade digital",
    acao_recomendada: "Contato imediato do gestor de contas",
  },
  {
    id: "4",
    nome: "EduTech Brasil",
    satisfacao: "positivo",
    sentimento: "Empolgado com o crescimento orgânico",
    conversas_iniciadas: 8,
    nota_gestor: 8,
    risco_churn: "baixo",
    tempo_medio_resposta: "1h 45min",
    demandas: "SEO, blog e redes sociais",
    entregas: "5 artigos publicados, 20 posts",
    falhas_gargalos: "Nenhuma",
    oportunidades: "Webinars e lead magnets",
    acao_recomendada: "Manter ritmo e propor webinar",
  },
  {
    id: "5",
    nome: "Auto Peças Nacional",
    satisfacao: "negativo",
    sentimento: "Frustrado com falta de resultados",
    conversas_iniciadas: 1,
    nota_gestor: 3,
    risco_churn: "alto",
    tempo_medio_resposta: "48h",
    demandas: "Google Ads e remarketing",
    entregas: "Campanhas com baixo desempenho",
    falhas_gargalos: "Orçamento mal distribuído, segmentação incorreta",
    oportunidades: "Reestruturação completa da estratégia",
    acao_recomendada: "Reunião de crise + novo plano de ação",
  },
  {
    id: "6",
    nome: "Clínica Vida Plena",
    satisfacao: "positivo",
    sentimento: "Satisfeita com agendamentos",
    conversas_iniciadas: 15,
    nota_gestor: 10,
    risco_churn: "baixo",
    tempo_medio_resposta: "45min",
    demandas: "Google Ads, Instagram e WhatsApp",
    entregas: "Todas as metas batidas",
    falhas_gargalos: "Nenhuma",
    oportunidades: "Expansão para YouTube",
    acao_recomendada: "Case de sucesso + depoimento em vídeo",
  },
];

export function useClientData() {
  const [clientes, setClientes] = useState<Cliente[]>(mockData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Falha ao buscar dados");
      const data: RelatorioCS = await response.json();
      setClientes(data.clientes);
      setError(null);
    } catch {
      // Keep mock data on error (dev mode)
      console.warn("Usando dados mock — endpoint não disponível");
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    // Try to fetch real data initially
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { clientes, loading, error, lastUpdate };
}
