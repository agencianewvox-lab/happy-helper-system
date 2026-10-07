import { z } from "zod";

export const meetingPlanSchema = z.object({
  focus: z.string().max(1500).default(""),
  scope: z.string().max(2500).default(""),
  agencyOwner: z.string().max(160).default(""),
  clientOwner: z.string().max(160).default(""),
  cadence: z.string().max(1000).default(""),
  measurement: z.string().max(1500).default(""),
  milestones: z.string().max(2500).default(""),
  decisions: z.string().max(2500).default(""),
  access: z.record(z.enum(["pending", "requested", "confirmed", "not-applicable"])).default({}),
});
export type MeetingPlan = z.infer<typeof meetingPlanSchema>;
export const emptyMeetingPlan = (): MeetingPlan => meetingPlanSchema.parse({});
export const ACCESS_ITEMS = [
  { id: "business", label: "Portfólio empresarial da Meta", detail: "Convidar a Newvox como parceira, com os ativos acordados." },
  { id: "ads", label: "Conta de anúncios e faturamento", detail: "Confirmar ID, acesso à conta e forma de pagamento ativa." },
  { id: "social", label: "Página do Facebook e Instagram", detail: "Vincular os perfis corretos ao portfólio empresarial." },
  { id: "tracking", label: "Site, eventos e mensuração", detail: "Validar domínio, pixel/conjunto de dados e eventos aplicáveis." },
  { id: "crm", label: "WhatsApp e atendimento", detail: "Definir o destino dos contatos, CRM e responsável pelo retorno." },
  { id: "brand", label: "Marca, materiais e aprovações", detail: "Reunir logo, imagens autorizadas e pessoa que aprova os criativos." },
] as const;
export const ACCESS_LABELS = { pending: "A confirmar", requested: "Solicitado", confirmed: "Validado pela equipe", "not-applicable": "Não se aplica" };

export const meetingPlanFields: { key: Exclude<keyof MeetingPlan, "access">; label: string; hint: string; max: number }[] = [
  { key: "focus", label: "Foco acordado para o início", hint: "Oferta, região e objetivo prioritário. Ex.: avaliações de implantes na região da clínica.", max: 1500 },
  { key: "scope", label: "Escopo e entregas", hint: "O que está contratado e o que não está incluído. Não registrar promessas ainda não aprovadas.", max: 2500 },
  { key: "agencyOwner", label: "Responsável Newvox", hint: "Nome do gestor e sua responsabilidade.", max: 160 },
  { key: "clientOwner", label: "Responsável do cliente", hint: "Pessoa que libera acessos e aprova materiais.", max: 160 },
  { key: "cadence", label: "Comunicação e rotina", hint: "Canal, horário de atendimento, frequência de retorno e reunião de acompanhamento.", max: 1000 },
  { key: "measurement", label: "Como vamos avaliar", hint: "Indicadores, metas a validar e fonte dos dados. Diferencie lead, agendamento e venda.", max: 1500 },
  { key: "milestones", label: "Próximos passos, responsáveis e datas", hint: "Uma linha por ação. Ex.: Cliente · liberar acessos · data a confirmar.", max: 2500 },
  { key: "decisions", label: "Decisões da reunião", hint: "Somente o que foi confirmado. Este texto será visível na apresentação exportada.", max: 2500 },
];
