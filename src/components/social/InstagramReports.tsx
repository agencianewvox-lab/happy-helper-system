import { useState } from "react";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publishingApi, type InstagramReport } from "@/lib/social-publishing";
import type { SocialClient } from "@/lib/social";
import {
  downloadInstagramPdf,
  downloadInstagramCsv,
} from "@/lib/social-instagram-report";
const metricNames: Record<string, string> = {
  views: "Visualizações",
  reach: "Contas alcançadas",
  accounts_engaged: "Contas engajadas",
  total_interactions: "Interações",
};
const value = (n: number | null | undefined) =>
  n == null ? "N/D" : n.toLocaleString("pt-BR");
export function InstagramReports({ clients }: { clients: SocialClient[] }) {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
  const [clientId, setClientId] = useState(""),
    [from, setFrom] = useState(
      new Date(Date.now() - 6 * 86400000).toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      }),
    ),
    [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false),
    [report, setReport] = useState<InstagramReport | null>(null),
    [notes, setNotes] = useState("");
  const [selected, setSelected] = useState(Object.keys(metricNames));
  async function generate() {
    setBusy(true);
    setReport(null);
    try {
      setReport(await publishingApi({ action: "report", clientId, from, to }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar relatório.");
    } finally {
      setBusy(false);
    }
  }
  async function pdf() {
    if (!report) return;
    setBusy(true);
    try {
      await downloadInstagramPdf(report, selected, notes);
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-gradient-to-br from-primary/10 to-card p-7">
        <p className="text-[10px] uppercase tracking-[.22em] text-primary">
          Newvox · Inteligência de conteúdo
        </p>
        <h2 className="text-2xl font-semibold mt-2">
          Resultados para apresentar.
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Escolha a conta, o período e as métricas. Exporte um relatório com a
          marca Newvox e sua análise.
        </p>
      </div>
      <fieldset
        disabled={busy}
        className="rounded-2xl border bg-card p-5 space-y-4"
      >
        <div className="grid md:grid-cols-3 gap-4">
          <label className="text-sm space-y-2">
            Cliente
            <select
              className="block w-full h-10 rounded-lg border bg-background px-3"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setReport(null);
                setNotes("");
              }}
            >
              <option value="">Selecionar cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-2">
            De
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setReport(null);
              }}
            />
          </label>
          <label className="text-sm space-y-2">
            Até
            <Input
              type="date"
              max={today}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setReport(null);
              }}
            />
          </label>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              size="sm"
              variant="outline"
              onClick={() => {
                setFrom(
                  new Date(
                    Date.now() - (days - 1) * 86400000,
                  ).toLocaleDateString("sv-SE", {
                    timeZone: "America/Sao_Paulo",
                  }),
                );
                setTo(today);
                setReport(null);
              }}
            >
              Últimos {days} dias
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {Object.entries(metricNames).map(([key, label]) => (
            <label key={key} className="text-xs flex gap-2 items-center">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked ? [...s, key] : s.filter((x) => x !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <Button disabled={!clientId || busy} onClick={() => void generate()}>
          {busy ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <BarChart3 className="size-4 mr-2" />
          )}
          Gerar relatório
        </Button>
      </fieldset>
      {report ? (
        <>
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h3 className="font-semibold text-xl">{report.clientName}</h3>
              <p className="text-sm text-primary">@{report.username}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => downloadInstagramCsv(report, selected, notes)}
              >
                <Download className="size-4 mr-2" />
                CSV
              </Button>
              <Button disabled={busy} onClick={() => void pdf()}>
                <Download className="size-4 mr-2" />
                PDF Newvox
              </Button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {selected.map((key) => (
              <div key={key} className="rounded-2xl border bg-card p-5">
                <p className="text-xs text-muted-foreground">
                  {metricNames[key]}
                </p>
                <p className="text-3xl font-semibold mt-3">
                  {value(report.metrics[key])}
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Período selecionado · Meta
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Seguidores atuais: {value(report.followers)} · {report.media.length}{" "}
            conteúdos encontrados no período.
          </p>
          {report.warnings.map((w) => (
            <p
              key={w}
              className="text-xs rounded-xl bg-amber-500/10 text-amber-600 p-3"
            >
              {w}
            </p>
          ))}
          <label className="block text-sm space-y-2">
            Análise e próximos passos
            <textarea
              maxLength={6000}
              rows={4}
              className="block w-full rounded-xl border bg-card p-4"
              placeholder="Inclua os destaques, aprendizados e ações do próximo período…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <section className="rounded-2xl border bg-card overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold">Conteúdos publicados no período</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Curtidas e comentários acumulados até a consulta, não apenas
                durante o período.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-4">Conteúdo</th>
                    <th>Formato</th>
                    <th>Data</th>
                    <th>Curtidas</th>
                    <th>Comentários</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.media]
                    .sort(
                      (a, b) =>
                        (b.likes || 0) +
                        (b.comments || 0) -
                        (a.likes || 0) -
                        (a.comments || 0),
                    )
                    .map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="p-4 max-w-sm">
                          <a
                            href={m.permalink || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary line-clamp-2"
                          >
                            {m.caption || "Sem legenda"}
                          </a>
                        </td>
                        <td className="text-xs">{m.type}</td>
                        <td className="text-xs whitespace-nowrap">
                          {new Date(m.timestamp).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="text-center">{value(m.likes)}</td>
                        <td className="text-center">{value(m.comments)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <BarChart3 className="size-10 mx-auto mb-4" />
          <p>
            Seu relatório aparece aqui após selecionar um cliente conectado.
          </p>
        </div>
      )}
    </div>
  );
}
