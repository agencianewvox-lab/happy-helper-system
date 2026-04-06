
-- Create system_configs table for all configurable parameters
CREATE TABLE public.system_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_label TEXT NOT NULL,
  config_category TEXT NOT NULL DEFAULT 'Geral',
  config_value TEXT NOT NULL,
  config_type TEXT NOT NULL DEFAULT 'text',
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;

-- Masters can read
CREATE POLICY "Masters can read system_configs" ON public.system_configs
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- Masters can update
CREATE POLICY "Masters can update system_configs" ON public.system_configs
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- Masters can insert
CREATE POLICY "Masters can insert system_configs" ON public.system_configs
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- Service role full access (for edge functions)
CREATE POLICY "Service role full access system_configs" ON public.system_configs
FOR ALL TO public
USING (true)
WITH CHECK (true);

-- Seed: SLA settings
INSERT INTO public.system_configs (config_key, config_label, config_category, config_value, config_type, description) VALUES
('sla_response_minutes', 'Tempo máximo de resposta (SLA)', 'SLA', '30', 'number', 'Minutos máximos para responder uma mensagem de cliente em horário comercial'),
('sla_biz_start_hour', 'Início do horário comercial', 'SLA', '8', 'number', 'Hora de início do horário comercial (0-23)'),
('sla_biz_end_hour', 'Fim do horário comercial', 'SLA', '18', 'number', 'Hora de fim do horário comercial (0-23)'),

-- Sentiment settings
('sentiment_critical_weight', 'Peso - Termos Críticos', 'Sentimento', '5', 'number', 'Peso aplicado quando detecta termos críticos (cancelar, rescisão, etc.)'),
('sentiment_high_weight', 'Peso - Termos Altos', 'Sentimento', '3', 'number', 'Peso aplicado para termos de alta gravidade (insatisfeito, péssimo, etc.)'),
('sentiment_medium_weight', 'Peso - Termos Médios', 'Sentimento', '1.5', 'number', 'Peso aplicado para termos de gravidade média (problema, demora, etc.)'),
('sentiment_positive_weight', 'Peso - Termos Positivos', 'Sentimento', '2', 'number', 'Peso que subtrai do score negativo quando há termos positivos'),
('sentiment_time_mult_24h', 'Multiplicador temporal - Últimas 24h', 'Sentimento', '3', 'number', 'Multiplicador para mensagens das últimas 24 horas'),
('sentiment_time_mult_3d', 'Multiplicador temporal - Últimos 3 dias', 'Sentimento', '2', 'number', 'Multiplicador para mensagens dos últimos 3 dias'),
('sentiment_time_mult_7d', 'Multiplicador temporal - Última semana', 'Sentimento', '1.5', 'number', 'Multiplicador para mensagens da última semana'),
('sentiment_positive_threshold', 'Limiar para Sentimento Positivo', 'Sentimento', '0.2', 'number', 'Score acima deste valor = positivo'),
('sentiment_negative_threshold', 'Limiar para Sentimento Negativo', 'Sentimento', '-0.2', 'number', 'Score abaixo deste valor = negativo'),
('sentiment_trend_threshold', 'Limiar de mudança de tendência', 'Sentimento', '0.15', 'number', 'Diferença mínima para considerar melhorando/piorando'),

-- Sentiment keyword lists
('sentiment_critical_terms', 'Termos Críticos (cancelamento)', 'Sentimento - Palavras', 'cancelar contrato,rescindir,não renovar,nao renovar,trocar de agência,trocar de agencia,outra agência,outra agencia,buscar outra empresa,acionar advogado,processar,procon,reclame aqui,vou cancelar,quero cancelar', 'textarea', 'Palavras que indicam risco de cancelamento (separadas por vírgula)'),
('sentiment_high_terms', 'Termos de Alta Gravidade', 'Sentimento - Palavras', 'insatisfeito,insatisfeita,insatisfação,insatisfacao,decepcionado,decepcionada,decepção,decepcao,péssimo,pessimo,horrível,horrivel,absurdo,descaso,inaceitável,inaceitavel,jogando dinheiro fora,não vale a pena,nao vale a pena,nunca funciona,nunca dá certo,nunca da certo,não entregam o que prometem,nao entregam o que prometem,cadê os resultados,cade os resultados,ninguém resolve,ninguem resolve,sempre a mesma coisa,não chegou lead,nao chegou lead,sem lead,zero lead,nenhum lead,sem resultado,sem retorno,resultado ruim,resultado péssimo,resultado pessimo,não estou vendo resultado,nao estou vendo resultado,não tá funcionando,nao ta funcionando,não está funcionando,nao esta funcionando,não funciona,nao funciona,não deu resultado,nao deu resultado,piorou,caiu,despencou,pago caro,estou pagando', 'textarea', 'Palavras que indicam insatisfação forte (separadas por vírgula)'),
('sentiment_medium_terms', 'Termos de Gravidade Média', 'Sentimento - Palavras', 'problema,demora,atraso,erro,não está funcionando,nao esta funcionando,quebrou,parou,cansado,chateado,irritado,estressado,cadê,cade,esperando,aguardando,quando fica pronto,previsão,previsao', 'textarea', 'Palavras que indicam problemas moderados (separadas por vírgula)'),
('sentiment_positive_terms', 'Termos Positivos', 'Sentimento - Palavras', 'excelente,incrível,incrivel,sensacional,maravilhoso,maravilhosa,espetacular,arrasou,mandou bem,nota 10,melhor agência,melhor agencia,perfeito,ótimo,otimo,muito bom,adorei,amei,gostei,top,show,parabéns,parabens,ficou lindo,ficou perfeito,aprovado,aprovada,satisfeito,satisfeita,feliz,contente,recomendo,👍,❤️,🔥,👏,💪,🙏,😍,⭐', 'textarea', 'Palavras que indicam satisfação (separadas por vírgula)'),

-- Churn Risk settings
('churn_sentiment_neg_critical_points', 'Pontos: Sentimento Negativo + Termos Críticos', 'Risco de Churn', '30', 'number', 'Pontos quando sentimento é negativo E há termos críticos'),
('churn_sentiment_neg_points', 'Pontos: Sentimento Negativo', 'Risco de Churn', '20', 'number', 'Pontos quando sentimento é negativo (sem termos críticos)'),
('churn_sentiment_neutral_points', 'Pontos: Sentimento Neutro', 'Risco de Churn', '5', 'number', 'Pontos quando sentimento é neutro'),
('churn_trend_piorando_points', 'Pontos: Tendência Piorando', 'Risco de Churn', '10', 'number', 'Pontos extras quando tendência de sentimento está piorando'),
('churn_pending_urgent_points', 'Pontos por Pendência Urgente', 'Risco de Churn', '10', 'number', 'Pontos adicionados por cada pendência urgente'),
('churn_pending_normal_points', 'Pontos por Pendência Normal', 'Risco de Churn', '5', 'number', 'Pontos adicionados por cada pendência normal'),
('churn_pending_low_points', 'Pontos por Pendência Baixa', 'Risco de Churn', '2', 'number', 'Pontos adicionados por cada pendência de baixa prioridade'),
('churn_pending_max_points', 'Máximo de pontos por Pendências', 'Risco de Churn', '30', 'number', 'Limite máximo de pontos no indicador de pendências'),
('churn_frt_4h_points', 'Pontos: FRT > 4 horas', 'Risco de Churn', '15', 'number', 'Pontos quando FRT médio é acima de 4 horas'),
('churn_frt_2h_points', 'Pontos: FRT 2-4 horas', 'Risco de Churn', '8', 'number', 'Pontos quando FRT médio é entre 2-4 horas'),
('churn_frt_1h_points', 'Pontos: FRT 1-2 horas', 'Risco de Churn', '3', 'number', 'Pontos quando FRT médio é entre 1-2 horas'),
('churn_inactive_5d_points', 'Pontos: Inativo > 5 dias', 'Risco de Churn', '15', 'number', 'Pontos quando grupo está inativo há mais de 5 dias'),
('churn_inactive_3d_points', 'Pontos: Inativo 3-5 dias', 'Risco de Churn', '8', 'number', 'Pontos quando grupo está inativo há 3-5 dias'),
('churn_inactive_1d_points', 'Pontos: Inativo 1-3 dias', 'Risco de Churn', '3', 'number', 'Pontos quando grupo está inativo há 1-3 dias'),
('churn_complaint_high_points', 'Pontos: Alto volume reclamações (>5)', 'Risco de Churn', '10', 'number', 'Pontos quando há mais de 5 reclamações'),
('churn_complaint_med_points', 'Pontos: Reclamações moderadas (>2)', 'Risco de Churn', '3', 'number', 'Pontos quando há mais de 2 reclamações'),
('churn_ads_low_score_points', 'Pontos: Score Ads < 40', 'Risco de Churn', '10', 'number', 'Pontos quando score de anúncios está abaixo de 40'),
('churn_ads_med_score_points', 'Pontos: Score Ads < 60', 'Risco de Churn', '5', 'number', 'Pontos quando score de anúncios está abaixo de 60'),
('churn_label_critico', 'Limiar: Risco Crítico', 'Risco de Churn', '80', 'number', 'Score a partir do qual o risco é considerado crítico'),
('churn_label_alto', 'Limiar: Risco Alto', 'Risco de Churn', '60', 'number', 'Score a partir do qual o risco é considerado alto'),
('churn_label_moderado', 'Limiar: Risco Moderado', 'Risco de Churn', '30', 'number', 'Score a partir do qual o risco é considerado moderado'),

-- Priority Máxima settings
('priority_churn_threshold', 'Limiar Churn p/ Prioridade Máxima', 'Prioridade Máxima', '80', 'number', 'Risco de churn acima deste valor + sentimento piorando = prioridade máxima'),
('priority_inactive_days', 'Dias inativos p/ Prioridade Máxima', 'Prioridade Máxima', '5', 'number', 'Dias de inatividade + sentimento negativo = prioridade máxima'),
('priority_pending_count', 'Nº pendências p/ Prioridade Máxima', 'Prioridade Máxima', '3', 'number', 'Número de pendências abertas + FRT alto + sentimento negativo = prioridade máxima'),
('priority_frt_threshold_min', 'FRT mínimo (min) p/ Prioridade Máxima', 'Prioridade Máxima', '240', 'number', 'FRT em minutos acima do qual contribui para prioridade máxima'),
('priority_ads_invest_threshold', 'Investimento Ads mínimo (R$)', 'Prioridade Máxima', '3000', 'number', 'Investimento em ads acima do qual + score ruim = prioridade máxima'),
('priority_ads_score_threshold', 'Score Ads mínimo', 'Prioridade Máxima', '40', 'number', 'Score de ads abaixo do qual + investimento alto = prioridade máxima'),

-- FRT settings
('frt_excellent_max', 'FRT Excelente (até minutos)', 'FRT', '15', 'number', 'Até quantos minutos o FRT é considerado excelente'),
('frt_good_max', 'FRT Bom (até minutos)', 'FRT', '30', 'number', 'Até quantos minutos o FRT é considerado bom'),
('frt_regular_max', 'FRT Regular (até minutos)', 'FRT', '60', 'number', 'Até quantos minutos o FRT é considerado regular'),
('frt_bad_max', 'FRT Ruim (até minutos)', 'FRT', '120', 'number', 'Até quantos minutos o FRT é considerado ruim'),
('frt_critical_max', 'FRT Crítico (até minutos)', 'FRT', '240', 'number', 'Até quantos minutos o FRT é considerado crítico (acima = péssimo)'),

-- Coach settings
('coach_inactive_hours', 'Horas p/ considerar grupo parado', 'CS Coach', '48', 'number', 'Horas de inatividade para o Coach disparar alerta de grupo parado'),

-- Noise filter patterns
('noise_greeting_patterns', 'Padrões de saudação (ignorar)', 'Filtros', 'bom dia,boa tarde,boa noite,oi,olá,ola,e aí,e ai', 'textarea', 'Saudações que devem ser ignoradas na análise de sentimento (separadas por vírgula)'),
('noise_confirmation_patterns', 'Padrões de confirmação (ignorar)', 'Filtros', 'ok,certo,beleza,combinado,pode ser,tá bom,ta bom,tá,ta,sim,não,nao,blz,vlw,valeu,top,show,perfeito', 'textarea', 'Confirmações curtas que devem ser ignoradas (separadas por vírgula)'),

-- Team members
('team_members', 'Membros da equipe', 'Equipe', 'jader,murillo,murilo,priscilla,priscila,alisson,joel,thais,daniella,victor botto,netto,netto monge,jiza', 'textarea', 'Nomes dos membros da equipe para identificação nas mensagens (separadas por vírgula)'),

-- Demand/Request keywords
('demand_keywords', 'Palavras-chave de demanda', 'Filtros', 'cadê,cade,esperando,aguardando,cobrando,quanto tempo,demora,atrasado,atraso', 'textarea', 'Palavras que indicam uma demanda/cobrança do cliente'),
('request_keywords', 'Palavras-chave de solicitação', 'Filtros', 'poderia,pode me,pode enviar,pode mandar,pode reenviar,reenviar,reenvie,reenvia,me enviar,me mandar,preciso,precisava,gostaria,necessito,tem como,teria como,seria possível,seria possivel,por favor,por gentileza,solicito,solicitar,caso tenha,se possível,se possivel,me passar,me informar,me envie,me mande,quando vai,quando será,quando sera,quando posso,ainda não recebi,ainda nao recebi,não recebi,nao recebi,não chegou,nao chegou', 'textarea', 'Palavras que indicam uma solicitação/pedido do cliente'),
('urgency_keywords', 'Palavras-chave de urgência', 'Filtros', 'urgente,emergência,emergencia,agora,imediato,parou,caiu,fora do ar', 'textarea', 'Palavras que indicam urgência na mensagem'),
('complaint_keywords', 'Palavras-chave de reclamação', 'Filtros', 'problema,reclamação,reclamacao,demora,falta de,cobrando,cobra', 'textarea', 'Palavras que indicam reclamação do cliente'),

-- Master verification password
('master_config_password', 'Senha de verificação Master', 'Segurança', 'newvox2024', 'password', 'Senha exigida antes de salvar qualquer alteração nas configurações');
