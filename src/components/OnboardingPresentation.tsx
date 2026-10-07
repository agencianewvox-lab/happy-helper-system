import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, Layers3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createOnboardingPresentation } from "@/lib/onboarding-presentation";
import type { OnboardingResponse } from "@/lib/onboarding-pdf";
import { emptyMeetingPlan, meetingPlanSchema, type MeetingPlan } from "@/lib/onboarding-plan";
import { MeetingPlanStoreError } from "@/lib/onboarding-plan-store";
import { OnboardingMeetingEditor } from "./OnboardingMeetingEditor";
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { toast } from "sonner";
import "./onboarding-presentation.css";

interface Props {
  response: OnboardingResponse;
  groupName: string;
  onClose: () => void;
  ownerId?: string;
}

export default function OnboardingPresentation(props: Props) {
  return <OnboardingPresentationContent key={`${props.ownerId}:${props.response.group_id}:${props.response.id || props.response.created_at}`} {...props} />;
}

function OnboardingPresentationContent({ response, groupName, onClose, ownerId }: Props) {
  const [index, setIndex] = useState(0);
  // Enable only after the SQL permission preflight and real role-isolation tests pass.
  const shared = import.meta.env.VITE_ONBOARDING_SYNC_ENABLED === "true" && Boolean(response.id && ownerId);
  const [version, setVersion] = useState(0);
  const [cloudLoading, setCloudLoading] = useState(shared);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const storageKey = ownerId ? `newvox:meeting:v1:${ownerId}:${response.group_id}:${response.created_at}` : null;
  const [plan, setPlan] = useState<MeetingPlan>(() => {
    try { return storageKey ? meetingPlanSchema.parse(JSON.parse(localStorage.getItem(storageKey) || "{}")) : emptyMeetingPlan(); }
    catch { return emptyMeetingPlan(); }
  });
  const [draft, setDraft] = useState(plan);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const deck = createOnboardingPresentation(response, groupName, plan);
  const { clientName, submittedAt, chapters } = deck;
  const chapter = chapters[index];
  const step = (delta: number) => setIndex((current) => Math.max(0, Math.min(chapters.length - 1, current + delta)));

  useEffect(() => { viewport.current?.scrollTo?.({ top: 0 }); }, [index, editing]);

  useEffect(() => {
    if (!shared || !response.id) return;
    let active = true;
    setCloudLoading(true); setCloudError(null);
    void import("@/lib/onboarding-plan-supabase").then(({ sharedMeetingPlanStore }) => sharedMeetingPlanStore.load(response.id!, response.group_id)).then(saved => {
      if (!active) return;
      setVersion(saved?.version || 0);
      if (saved) { setPlan(saved.plan); setDraft(saved.plan); }
      else if (reload > 0) { const empty = emptyMeetingPlan(); setPlan(empty); setDraft(empty); }
    }).catch(() => {
      if (active) setCloudError("Não foi possível carregar o plano da equipe. Nenhuma alteração foi sincronizada.");
    }).finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [shared, response.id, response.group_id, reload]);

  const save = async () => {
    const result = meetingPlanSchema.safeParse(draft);
    if (!result.success) { toast.error("Revise os limites dos campos."); return; }
    if (shared && response.id) {
      if (saving || cloudLoading || cloudError) return;
      setSaving(true);
      try {
        const { sharedMeetingPlanStore } = await import("@/lib/onboarding-plan-supabase");
        const saved = await sharedMeetingPlanStore.save(response.id, response.group_id, result.data, version);
        setPlan(saved.plan); setDraft(saved.plan); setVersion(saved.version); setEditing(false);
        toast.success("Plano salvo no painel e disponível à equipe autorizada.");
      } catch (error) {
        const message = error instanceof MeetingPlanStoreError && error.kind === "conflict"
          ? "Outro usuário alterou o plano. Suas edições continuam na tela e não sobrescreveram a versão salva."
          : "Não foi possível salvar no painel. Suas edições continuam na tela; nada foi sincronizado.";
        setCloudError(message); toast.error(message);
      } finally { setSaving(false); }
      return;
    }
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(result.data)); }
      catch { toast.error("Não foi possível salvar neste navegador. Suas alterações continuam na tela; baixe o HTML para guardá-las."); setPlan(result.data); setEditing(false); return; }
    }
    setPlan(result.data); setEditing(false);
    toast.success(storageKey ? "Rascunho salvo neste navegador." : "Alterações aplicadas nesta sessão.");
  };
  const exportHtml = async () => {
    setExporting(true);
    try {
      const { downloadOnboardingHtml } = await import("@/lib/onboarding-html");
      await downloadOnboardingHtml(deck, newvoxLogo);
      toast.success("HTML pronto. Revise antes de compartilhar: quem receber o arquivo poderá ler o conteúdo.");
    } catch { toast.error("Não foi possível baixar a apresentação. Tente novamente."); }
    finally { setExporting(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="nv-presentation" onKeyDown={(event) => {
        if (editing) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
        if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      }}>
        <DialogTitle className="sr-only">Apresentação de onboarding — {clientName}</DialogTitle>
        <DialogDescription className="sr-only">Apresentação baseada nas respostas salvas. Use as setas para navegar pelos capítulos e Escape para fechar.</DialogDescription>
        <header className="nv-presentation-top">
          <div className="nv-presentation-brand"><img src={newvoxLogo} alt="Newvox" /><div>NEWVOX<small>CLIENT EXPERIENCE</small></div></div>
          <div className="nv-presentation-toolbar"><span className="nv-presentation-context">ONBOARDING / PLANO DE INÍCIO</span><button type="button" disabled={saving || cloudLoading || Boolean(cloudError)} onClick={() => { if (!editing) setDraft(plan); setEditing(!editing); }}>{editing ? "Voltar à apresentação" : "Personalizar reunião"}</button><button type="button" onClick={exportHtml} disabled={exporting || editing || cloudLoading}>{exporting ? "Preparando…" : "Baixar HTML"}</button></div>
        </header>
        <div className="nv-presentation-layout">
          <aside className="nv-presentation-sidebar" hidden={editing}>
            <p className="nv-presentation-eyebrow">NOSSA CONVERSA</p>
            <nav aria-label="Capítulos da apresentação">
              {chapters.map((item, position) => (
                <button key={item.id} type="button" onClick={() => setIndex(position)} aria-current={index === position ? "step" : undefined}>
                  <span>{String(position + 1).padStart(2, "0")}</span>{item.label}
                  {position < index && <Check size={13} aria-hidden="true" />}
                </button>
              ))}
            </nav>
            <div className="nv-presentation-source"><Layers3 size={18} aria-hidden="true" /><p>Briefing recebido<br /><strong>{submittedAt}</strong></p><small>Seu contexto + o método Newvox. Um plano construído em conjunto.</small></div>
          </aside>
          <main ref={viewport} className="nv-presentation-viewport">
            {cloudLoading && <p role="status">Carregando plano da equipe…</p>}
            {shared && !cloudLoading && !cloudError && <p className="nv-editor-notice">{version ? `Plano da equipe · versão ${version}` : "Novo plano · ainda não salvo no painel"}</p>}
            {cloudError && <div role="alert" className="nv-editor-notice"><p>{cloudError}</p><button type="button" disabled={saving} onClick={() => { setEditing(false); setReload(value => value + 1); }}>{editing ? "Descartar minhas edições e recarregar" : "Recarregar plano da equipe"}</button></div>}
            {editing ? <OnboardingMeetingEditor plan={draft} onChange={setDraft} onSave={save} onCancel={() => setEditing(false)} canPersist={Boolean(storageKey)} shared={shared} busy={saving || cloudLoading} saveDisabled={Boolean(cloudError)} /> : <section key={chapter.id} className={"nv-presentation-chapter nv-presentation-" + chapter.kind} aria-labelledby="presentation-chapter-title">
              <div className="nv-presentation-kicker"><span>{String(index + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span><span>{chapter.label}</span></div>
              <div className="nv-presentation-heading">
                <h2 id="presentation-chapter-title" aria-live="polite">{chapter.title}</h2>
                {chapter.kind === "cover" && <div className="nv-presentation-orbit" aria-hidden="true"><span /><ArrowDownRight /></div>}
              </div>
              <p className="nv-presentation-intro">{chapter.description}</p>
              <div className="nv-presentation-facts">
                {chapter.facts.map((fact) => (
                  <article key={fact.label} className={fact.missing ? "nv-presentation-fact is-pending" : "nv-presentation-fact"}>
                    <h3>{fact.label}</h3><p>{fact.value}</p>
                    {fact.missing && <span className="nv-presentation-pending">Ponto para alinharmos</span>}
                  </article>
                ))}
              </div>
              <p className="nv-presentation-footnote">{chapter.kind === "agenda" ? "Plano de reunião · Confirme escopo, responsáveis e datas antes de executar." : "Fonte: onboarding preenchido pelo cliente · Informações sujeitas à confirmação na reunião."}</p>
            </section>}
          </main>
        </div>
        <footer className="nv-presentation-controls" hidden={editing}>
          <span className="nv-presentation-client">{clientName}</span>
          <div className="nv-presentation-mobile-progress" aria-label="Progresso">{index + 1} / {chapters.length}</div>
          <div className="nv-presentation-actions">
            <button type="button" aria-label="Capítulo anterior" onClick={() => step(-1)} disabled={index === 0}><ArrowLeft size={18} /></button>
            {index < chapters.length - 1 ? <button type="button" className="nv-presentation-next" onClick={() => step(1)}>Próximo <ArrowRight size={18} /></button> : <button type="button" className="nv-presentation-next" onClick={onClose}>Concluir <Check size={18} /></button>}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
