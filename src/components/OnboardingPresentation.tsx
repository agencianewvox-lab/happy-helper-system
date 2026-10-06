import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, Layers3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createOnboardingPresentation } from "@/lib/onboarding-presentation";
import type { OnboardingResponse } from "@/lib/onboarding-pdf";
import "./onboarding-presentation.css";

interface Props {
  response: OnboardingResponse;
  groupName: string;
  onClose: () => void;
}

export default function OnboardingPresentation({ response, groupName, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const { clientName, submittedAt, chapters } = createOnboardingPresentation(response, groupName);
  const chapter = chapters[index];
  const step = (delta: number) => setIndex((current) => Math.max(0, Math.min(chapters.length - 1, current + delta)));

  useEffect(() => { viewport.current?.scrollTo?.({ top: 0 }); }, [index]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="nv-presentation" onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
        if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      }}>
        <DialogTitle className="sr-only">Apresentação de onboarding — {clientName}</DialogTitle>
        <DialogDescription className="sr-only">Apresentação baseada nas respostas salvas. Use as setas para navegar pelos capítulos e Escape para fechar.</DialogDescription>
        <header className="nv-presentation-top">
          <span className="nv-presentation-brand">NEW VOX<span>CLIENT EXPERIENCE</span></span>
          <span className="nv-presentation-context"><span /> ONBOARDING / BRIEFING</span>
        </header>
        <div className="nv-presentation-layout">
          <aside className="nv-presentation-sidebar">
            <p className="nv-presentation-eyebrow">NOSSA CONVERSA</p>
            <nav aria-label="Capítulos da apresentação">
              {chapters.map((item, position) => (
                <button key={item.id} type="button" onClick={() => setIndex(position)} aria-current={index === position ? "step" : undefined}>
                  <span>{String(position + 1).padStart(2, "0")}</span>{item.label}
                  {position < index && <Check size={13} aria-hidden="true" />}
                </button>
              ))}
            </nav>
            <div className="nv-presentation-source"><Layers3 size={18} aria-hidden="true" /><p>Briefing recebido<br /><strong>{submittedAt}</strong></p><small>Conteúdo montado automaticamente com suas respostas.</small></div>
          </aside>
          <main ref={viewport} className="nv-presentation-viewport">
            <section key={chapter.id} className={"nv-presentation-chapter nv-presentation-" + chapter.kind} aria-labelledby="presentation-chapter-title">
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
              <p className="nv-presentation-footnote">{chapter.kind === "agenda" ? "Pauta sugerida · Nenhum compromisso foi criado automaticamente." : "Fonte: onboarding preenchido pelo cliente · Informações sujeitas à confirmação na reunião."}</p>
            </section>
          </main>
        </div>
        <footer className="nv-presentation-controls">
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
