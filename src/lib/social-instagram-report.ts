import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { InstagramReport } from "@/lib/social-publishing";
import logoUrl from "@/assets/newvox-logo.jpg";
const labels: Record<string, string> = {
  views: "Visualizações",
  reach: "Contas alcançadas",
  accounts_engaged: "Contas engajadas",
  total_interactions: "Interações",
};
const fmt = (v: number | null | undefined) =>
  v == null ? "N/D" : v.toLocaleString("pt-BR");
export function csvCell(v: unknown) {
  let s = String(v ?? "N/D");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function instagramCsv(
  report: InstagramReport,
  selected = Object.keys(report.metrics),
  notes = "",
) {
  return (
    "\ufeff" +
    [
      ["NEWVOX", report.clientName, "@" + report.username],
      ["Período", report.range.from, report.range.to],
      ["Seguidores atuais", report.followers],
      ...selected.map((k) => [labels[k] || k, report.metrics[k]]),
      ["Análise", notes],
      ...report.warnings.map((w) => ["Observação", w]),
      ["Curtidas e comentários acumulados até a consulta"],
      ["Publicação", "Formato", "Data", "Curtidas", "Comentários", "Link"],
      ...report.media.map((m) => [
        m.caption,
        m.type,
        m.timestamp,
        m.likes,
        m.comments,
        m.permalink,
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
export function downloadInstagramCsv(
  report: InstagramReport,
  selected = Object.keys(report.metrics),
  notes = "",
) {
  const url = URL.createObjectURL(
    new Blob([instagramCsv(report, selected, notes)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "Newvox-Instagram-" + report.range.from + "-" + report.range.to + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadInstagramPdf(
  report: InstagramReport,
  selected: string[],
  notes: string,
) {
  const [pdfModule, fontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);
  let logo: string | undefined;
  try {
    const blob = await (await fetch(logoUrl)).blob();
    logo = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    /* text brand fallback */
  }
  const content: Content[] = [
    {
      columns: [
        logo
          ? { image: logo, width: 48 }
          : { text: "NEWVOX", fontSize: 24, bold: true, color: "#0EA5E9" },
        {
          text: "SOCIAL MEDIA\nRELATÓRIO DE INSTAGRAM",
          alignment: "right",
          fontSize: 10,
          color: "#64748B",
          margin: [0, 10, 0, 0],
        },
      ],
    },
    {
      text: report.clientName,
      fontSize: 25,
      bold: true,
      color: "#0F172A",
      margin: [0, 28, 0, 8],
    },
    {
      text:
        "@" +
        report.username +
        " · " +
        report.range.from +
        " a " +
        report.range.to,
      fontSize: 11,
      color: "#0284C7",
      margin: [0, 0, 0, 24],
    },
    {
      table: {
        widths: ["*", 100],
        body: [
          [
            { text: "Indicador", bold: true },
            { text: "Resultado", bold: true },
          ],
          ...selected.map((k) => [labels[k] || k, fmt(report.metrics[k])]),
          ["Seguidores atuais", fmt(report.followers)],
        ],
      },
      layout: "lightHorizontalLines",
    },
    {
      text: "Análise e próximos passos",
      fontSize: 15,
      bold: true,
      margin: [0, 24, 0, 10],
    },
    {
      text: notes || "Sem observações adicionais.",
      fontSize: 10,
      lineHeight: 1.4,
    },
    ...report.warnings.map(
      (w) =>
        ({
          text: w,
          fontSize: 9,
          color: "#92400E",
          margin: [0, 10, 0, 0],
        }) as Content,
    ),
    {
      text: "Conteúdos publicados no período",
      fontSize: 15,
      bold: true,
      margin: [0, 24, 0, 6],
    },
    {
      text: "Curtidas e comentários acumulados até a consulta. Métricas indisponíveis aparecem como N/D.",
      fontSize: 9,
      color: "#64748B",
      margin: [0, 0, 0, 12],
    },
    {
      table: {
        headerRows: 1,
        widths: ["*", 65, 40, 50],
        body: [
          ["Conteúdo", "Data", "Curtidas", "Coment."],
          ...report.media.map((m) => [
            {
              text: m.caption.slice(0, 180) || m.type,
              link: m.permalink || undefined,
            },
            new Date(m.timestamp).toLocaleDateString("pt-BR"),
            fmt(m.likes),
            fmt(m.comments),
          ]),
        ],
      },
      layout: "lightHorizontalLines",
      fontSize: 9,
    },
  ];
  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [42, 40, 42, 50],
    defaultStyle: { font: "Roboto" },
    content,
    footer: (page, pages) => ({
      text:
        "NEWVOX · Social Media · " +
        new Date(report.generatedAt).toLocaleString("pt-BR") +
        "   |   " +
        page +
        "/" +
        pages,
      fontSize: 8,
      color: "#64748B",
      alignment: "center",
      margin: [0, 16, 0, 0],
    }),
  };
  (pdfModule.default ?? pdfModule)
    .createPdf(
      definition,
      undefined,
      undefined,
      (fontsModule.default ?? fontsModule) as Record<string, string>,
    )
    .download(
      "Newvox-Instagram-" + report.range.from + "-" + report.range.to + ".pdf",
    );
}
