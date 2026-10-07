import { ACCESS_ITEMS, ACCESS_LABELS, meetingPlanFields, type MeetingPlan } from "@/lib/onboarding-plan";

interface Props {
  plan: MeetingPlan;
  onChange: (plan: MeetingPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  canPersist: boolean;
}

export function OnboardingMeetingEditor({ plan, onChange, onSave, onCancel, canPersist }: Props) {
  return <div className="nv-meeting-editor">
    <div className="nv-presentation-kicker">PREPARAÇÃO / REUNIÃO</div>
    <h2>Personalize a conversa.</h2>
    <p>O briefing original permanece intacto. Escreva apenas informações que o cliente pode ver. Não inclua senhas ou tokens.</p>
    <p className="nv-editor-notice">{canPersist ? "Rascunho salvo somente neste navegador, para seu usuário e este formulário. Não é sincronizado com os outros gestores. Baixe o HTML para levar à reunião." : "Edição nesta sessão. Baixe o HTML para guardar a apresentação personalizada."}</p>
    <div className="nv-editor-fields">
      {meetingPlanFields.map(field => <label key={field.key}>
        <span>{field.label}</span>
        <textarea value={plan[field.key]} maxLength={field.max} rows={field.max > 160 ? 3 : 2} placeholder={field.hint} onChange={e => onChange({ ...plan, [field.key]: e.target.value })} />
      </label>)}
    </div>
    <h3>Acessos e preparação</h3>
    <p>O status é uma conferência manual da equipe, não uma validação automática das permissões.</p>
    <div className="nv-editor-access">
      {ACCESS_ITEMS.map(item => <label key={item.id}><span>{item.label}<small>{item.detail}</small></span><select aria-label={`Status: ${item.label}`} value={plan.access[item.id] || "pending"} onChange={e => onChange({ ...plan, access: { ...plan.access, [item.id]: e.target.value as MeetingPlan["access"][string] } })}>{Object.entries(ACCESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
    </div>
    <div className="nv-editor-buttons"><button type="button" onClick={onCancel}>Cancelar alterações</button><button type="button" className="nv-presentation-next" onClick={onSave}>{canPersist ? "Salvar rascunho e apresentar" : "Aplicar e apresentar"}</button></div>
  </div>;
}
