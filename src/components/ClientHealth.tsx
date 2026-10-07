import type { Grupo } from "@/types/client";
import { clientHealth } from "@/lib/client-health";

export function ClientHealthBadge({ group }: { group: Grupo }) {
  const health = clientHealth(group);
  const color = health.score === null ? "text-muted-foreground bg-muted" : health.score >= 80 ? "text-blue-500 bg-blue-500/10" : health.score >= 50 ? "text-amber-500 bg-amber-500/10" : "text-red-500 bg-red-500/10";
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] ${color}`} title={`Saúde operacional, não NPS. ${health.reasons.join(" ")}`}>Saúde {health.score === null ? "—" : `${health.score}/100`}</span>;
}

export function ClientHealthPanel({ group }: { group: Grupo }) {
  const health = clientHealth(group);
  return <section className="rounded-xl border border-border p-4 space-y-3">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Saúde operacional</h3><p className="text-xs text-muted-foreground">Sinais do grupo. Não é a nota de satisfação do cliente.</p></div><ClientHealthBadge group={group} /></div>
    <p className="text-sm font-medium">{health.label}</p>
    <ul className="space-y-1 list-disc pl-5 text-xs text-muted-foreground">{health.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <p className="text-sm"><span className="font-medium">Próxima ação: </span>{health.nextAction}</p>
    <p className="text-[10px] text-muted-foreground">Regra v2 · Segunda a sexta, 8h–18h30, horário de Brasília, sem calendário de feriados. Silêncio e atraso de retorno reduzem o índice; não estimam probabilidade de cancelamento. NPS real vem somente da pesquisa.</p>
  </section>;
}
