import { useState } from "react";
import { Search, Users, AudioLines, MessageSquareText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { meetingOffset, type MeetingDetail } from "@/lib/meetings";

export function MeetingTranscript({ meeting: m }: { meeting: MeetingDetail }) {
  const [mode, setMode] = useState<"captions" | "audio">("captions");
  const [search, setSearch] = useState(""),
    [speaker, setSpeaker] = useState("");
  const cues = m.utterances || [];
  const people = [...new Set(cues.map((c) => c.speaker))];
  const filtered = cues.filter(
    (c) =>
      (!speaker || c.speaker === speaker) &&
      `${c.speaker} ${c.text}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const audio = m.chunks.filter(
    (c) =>
      c.transcript &&
      c.transcript
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500/5 to-transparent">
      <div className="border-b border-blue-400/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <MessageSquareText className="h-4 w-4 text-blue-400" /> Linha do
            tempo da conversa
          </h3>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users size={14} />
            {people.length} nomes · {cues.length} falas
          </span>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Fonte da transcrição"
        >
          <Button
            size="sm"
            variant={mode === "captions" ? "default" : "outline"}
            aria-pressed={mode === "captions"}
            onClick={() => setMode("captions")}
          >
            Falas identificadas
          </Button>
          <Button
            size="sm"
            variant={mode === "audio" ? "default" : "outline"}
            aria-pressed={mode === "audio"}
            onClick={() => setMode("audio")}
          >
            <AudioLines size={14} /> Áudio de apoio
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {mode === "captions"
            ? "Nomes exibidos nas legendas do Meet, não identificação por voz. Horários indicam quando o trecho foi capturado. Revise nomes e falas automáticos; pessoas que compartilham um dispositivo podem aparecer com o mesmo nome."
            : "Transcrição pela OpenAI do áudio misturado. Sem atribuir pessoas por suposição. Pode repetir as falas identificadas; não representa uma segunda conversa."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search
              size={15}
              className="absolute left-3 top-3 text-muted-foreground"
            />
            <Input
              className="pl-9"
              aria-label="Buscar na transcrição"
              placeholder="Buscar palavra ou trecho…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {mode === "captions" && (
            <select
              aria-label="Filtrar participante"
              className="max-w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
            >
              <option value="">Todos os nomes</option>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div
        className="max-h-[55vh] space-y-5 overflow-y-auto p-5"
        role="region"
        aria-label="Trechos da reunião"
        tabIndex={0}
      >
        {mode === "captions" ? (
          filtered.length ? (
            filtered.map((c) => (
              <article
                key={c.id}
                className="border-l-2 border-blue-400/40 pl-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-blue-400">
                    {c.speaker}
                  </span>
                  <time className="text-xs tabular-nums text-muted-foreground">
                    {meetingOffset(c.start_ms)} ·{" "}
                    {new Date(
                      new Date(m.started_at).getTime() + c.start_ms,
                    ).toLocaleTimeString("pt-BR")}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                  {c.text}
                </p>
              </article>
            ))
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {cues.length
                ? "Nenhuma fala corresponde ao filtro."
                : "Não há falas identificadas neste registro. Para novas reuniões, atualize a extensão e ative as legendas do Meet. O áudio de apoio permanece disponível."}
            </div>
          )
        ) : audio.length ? (
          audio.map((c) => (
            <article key={c.seq} className="border-l-2 border-muted pl-4">
              <span className="text-xs text-muted-foreground">
                {meetingOffset(c.offset_ms || 0)} · Pessoa não identificada
              </span>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                {c.transcript}
              </p>
            </article>
          ))
        ) : (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {search
              ? "Nenhum trecho corresponde à busca."
              : m.transcript || "Áudio aguardando processamento."}
          </p>
        )}
      </div>
    </section>
  );
}
