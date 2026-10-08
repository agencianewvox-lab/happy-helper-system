import { describe, it, expect } from "vitest";
import { csvCell, instagramCsv } from "@/lib/social-instagram-report";
import type { InstagramReport } from "@/lib/social-publishing";
const report: InstagramReport = {
  clientName: "Cliente A",
  username: "perfil_a",
  range: { from: "2026-10-01", to: "2026-10-07" },
  generatedAt: "2026-10-08T12:00:00Z",
  followers: 100,
  metrics: { reach: null, views: 0 },
  warnings: ["Sem alcance disponível"],
  media: [],
};
describe("Instagram report export", () => {
  it("does not turn unavailable metrics into zero", () => {
    const csv = instagramCsv(report);
    expect(csv).toContain('"Contas alcançadas";"N/D"');
    expect(csv).toContain('"Visualizações";"0"');
  });
  it("exports only selected metrics with analysis and data limitations", () => {
    const csv = instagramCsv(report, ["reach"], "Próximos passos");
    expect(csv).not.toContain("Visualizações");
    expect(csv).toContain("Próximos passos");
    expect(csv).toContain("Sem alcance disponível");
    expect(csv).not.toContain("Cliente B");
  });
  it.each(["=SUM(A1)", " +123", "\t@formula", "-1"])(
    "neutralizes spreadsheet formulas %s",
    (v) => expect(csvCell(v)).toMatch(/^"'\/?.*/),
  );
  it("escapes multiline captions and quotes", () =>
    expect(csvCell('Linha 1\n"teste"')).toBe('"Linha 1\n""teste"""'));
});
