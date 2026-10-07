import type { Grupo } from "@/types/client";
import { businessMinutesBetween } from "./clientMonitoring";

export function clientHealth(group: Pick<Grupo, "ultimo_horario" | "actionable_waiting_since" | "total_mensagens">, now = new Date()) {
  const valid = (value: string | null | undefined) => Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime());
  if (!group.total_mensagens || !valid(group.ultimo_horario)) return { score: null, label: "Sem base", reasons: ["Ainda não há histórico de mensagens suficiente."], nextAction: "Conferir vínculo do grupo e recebimento do WhatsApp." };
  const reasons: string[] = [];
  let penalty = 0;
  let nextAction = "Manter a rotina combinada com o cliente e acompanhar os próximos contatos.";
  const idle = businessMinutesBetween(group.ultimo_horario!, now.toISOString());
  if (idle > 1260) { penalty += 25; reasons.push("Mais de dois dias úteis de expediente sem interação (−25)."); nextAction = "Retomar o contato com uma atualização útil, respeitando a rotina combinada."; }
  else if (idle > 630) { penalty += 10; reasons.push("Mais de um dia útil de expediente sem interação (−10)."); nextAction = "Conferir se há atualização ou alinhamento pendente para o cliente."; }
  const waiting = valid(group.actionable_waiting_since) ? businessMinutesBetween(group.actionable_waiting_since!, now.toISOString()) : 0;
  if (waiting > 30) {
    const points = waiting > 630 ? 60 : waiting > 120 ? 45 : 25;
    penalty += points;
    reasons.push(`Mensagem que pede retorno aguardando ${Math.round(waiting)} minutos úteis (−${points}).`);
    nextAction = "Revisar a última solicitação e responder ou combinar um prazo para resolução.";
  }
  if (!reasons.length) reasons.push("Nenhum alerta de silêncio ou de resposta atrasada nos sinais monitorados.");
  const score = Math.max(0, 100 - penalty);
  return { score, label: score >= 80 ? "Em dia" : score >= 50 ? "Atenção" : "Prioridade", reasons, nextAction };
}

export function portfolioForUser<T extends { gestor_responsavel?: string | null }>(groups: T[], isMaster: boolean, gestor: string | null) {
  return isMaster ? groups : gestor ? groups.filter(g => g.gestor_responsavel === gestor) : [];
}

export function realNps<T extends { group_id: string; score: number; created_at: string }>(surveys: T[]) {
  const latest = new Map<string, T>();
  for (const survey of surveys) {
    if (!Number.isInteger(survey.score) || survey.score < 0 || survey.score > 10 || !Number.isFinite(Date.parse(survey.created_at))) continue;
    const previous = latest.get(survey.group_id);
    if (!previous || Date.parse(survey.created_at) > Date.parse(previous.created_at)) latest.set(survey.group_id, survey);
  }
  const values = [...latest.values()];
  const total = values.length;
  const promoters = values.filter(s => s.score >= 9).length;
  const detractors = values.filter(s => s.score <= 6).length;
  return { total, promoters, detractors, passive: total - promoters - detractors, nps: total ? Math.round((promoters - detractors) / total * 100) : 0, avg: total ? values.reduce((n, s) => n + s.score, 0) / total : 0 };
}
