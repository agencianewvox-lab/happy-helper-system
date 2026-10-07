import { Fragment } from "react";
import {
  MessageCircle,
  CheckCheck,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
function MessageText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|{{[^{}]+}})/g)
        .map((part, i) =>
          part.startsWith("{{") ? (
            <span key={i} className="rounded bg-sky-500/15 px-1 text-sky-300">
              {part}
            </span>
          ) : part.startsWith("*") && part.endsWith("*") ? (
            <strong key={i}>{part.slice(1, -1)}</strong>
          ) : part.startsWith("_") && part.endsWith("_") ? (
            <em key={i}>{part.slice(1, -1)}</em>
          ) : part.startsWith("~") && part.endsWith("~") ? (
            <s key={i}>{part.slice(1, -1)}</s>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
    </>
  );
}
export function WhatsAppPreview({
  name,
  message,
  draft = false,
}: {
  name: string;
  message: string;
  draft?: boolean;
}) {
  return (
    <section
      aria-label={
        draft
          ? "Modelo da mensagem no WhatsApp"
          : "Prévia da mensagem no WhatsApp"
      }
      className="overflow-hidden rounded-2xl border border-slate-700 shadow-xl"
    >
      <div className="flex items-center gap-3 bg-[#202c33] px-4 py-3 text-slate-100">
        <ArrowLeft size={16} aria-hidden />
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500/20">
          <MessageCircle size={20} className="text-sky-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-slate-400">
            {draft
              ? "Modelo • variáveis preenchidas na prévia real"
              : "Grupo do cliente • nenhuma mensagem enviada"}
          </p>
        </div>
        <MoreVertical size={18} aria-hidden />
      </div>
      <div
        className="min-h-72 bg-[#0b141a] p-4 sm:p-6"
        style={{
          backgroundImage: "radial-gradient(#ffffff08 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <p className="mx-auto mb-5 w-fit rounded-lg bg-[#182229] px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400">
          {draft ? "Rascunho do relatório" : "Prévia revisável"}
        </p>
        <div className="ml-3 rounded-xl rounded-tr-none bg-[#005c4b] px-4 py-3 text-sm leading-relaxed text-[#e9edef] shadow-md">
          <div className="whitespace-pre-wrap break-words">
            <MessageText text={message} />
          </div>
          <div className="mt-2 flex justify-end items-center gap-1 text-[10px] text-[#b1d5ca]">
            <span>09:00</span>
            <CheckCheck size={15} aria-hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
