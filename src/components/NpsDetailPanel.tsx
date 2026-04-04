import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowUp, ArrowDown, Minus, Star, AlertTriangle } from "lucide-react";
import type { NpsPrediction, NpsDimensionScore } from "@/types/client";

interface NpsDetailPanelProps {
  prediction: NpsPrediction | undefined;
}

export function NpsDetailPanel({ prediction }: NpsDetailPanelProps) {
  if (!prediction) return null;

  const { nps_score, nps_categoria, confianca, tendencia, score_anterior, fator_principal, recomendacao, fatores_positivos, fatores_negativos, dimension_scores } = prediction;

  if (confianca < 20) {
    return (
      <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
        <p className="text-sm text-muted-foreground">NPS Preditivo — Dados insuficientes</p>
      </div>
    );
  }

  const catColors = {
    promotor: { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    neutro: { text: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30" },
    detrator: { text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30" },
  };
  const colors = catColors[nps_categoria];
  const diff = score_anterior != null ? nps_score - score_anterior : null;
  const sortedDimensions = [...(dimension_scores || [])].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className={cn("p-3 rounded-lg border", colors.bg, colors.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn("text-3xl font-black", colors.text)}>{nps_score.toFixed(1)}</span>
            <div>
              <Badge className={cn("text-[10px]", colors.bg, colors.text, colors.border)}>
                {nps_categoria === "promotor" ? "Promotor" : nps_categoria === "neutro" ? "Neutro" : "Detrator"}
              </Badge>
              <div className="flex items-center gap-1 mt-1 text-[10px]">
                {tendencia === "subindo" && <><ArrowUp className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Subindo {diff != null ? `+${diff.toFixed(1)} pts` : ""}</span></>}
                {tendencia === "caindo" && <><ArrowDown className="w-3 h-3 text-red-500" /><span className="text-red-500">Caindo {diff != null ? `${diff.toFixed(1)} pts` : ""}</span></>}
                {tendencia === "estavel" && <><Minus className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">Estável</span></>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Confiança</p>
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${confianca}%` }} />
              </div>
              <span className="text-[10px] font-medium">{confianca}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dimensions Breakdown */}
      <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Dimensões do NPS</p>
        {sortedDimensions.map((dim, idx) => {
          const isMain = dim.nome === fator_principal || (fator_principal && fator_principal.toLowerCase().includes(dim.nome.toLowerCase()));
          const barColor = dim.score >= 7 ? "bg-emerald-500" : dim.score >= 5 ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={idx} className={cn("flex items-center gap-2 text-xs", isMain && "bg-primary/5 -mx-1 px-1 py-0.5 rounded border border-primary/20")}>
              {isMain && <Star className="w-3 h-3 text-primary shrink-0" />}
              <span className="text-muted-foreground w-32 shrink-0 truncate">{dim.nome}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${dim.score * 10}%` }} />
              </div>
              <span className={cn("font-medium tabular-nums w-8 text-right", dim.score >= 7 ? "text-emerald-500" : dim.score >= 5 ? "text-amber-500" : "text-red-500")}>
                {dim.score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Factors */}
      {(fatores_positivos.length > 0 || fatores_negativos.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {fatores_positivos.length > 0 && (
            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-1">
              <p className="text-[10px] font-semibold text-emerald-500">↑ Puxa pra cima</p>
              {fatores_positivos.slice(0, 4).map((f, i) => (
                <p key={i} className="text-[10px] text-emerald-400 truncate" title={f.fator}>{f.fator}</p>
              ))}
            </div>
          )}
          {fatores_negativos.length > 0 && (
            <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1">
              <p className="text-[10px] font-semibold text-red-500">↓ Puxa pra baixo</p>
              {fatores_negativos.slice(0, 4).map((f, i) => (
                <p key={i} className="text-[10px] text-red-400 truncate" title={f.fator}>{f.fator}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommendation */}
      {recomendacao && (
        <div className={cn("p-3 rounded-lg border", nps_categoria === "detrator" ? "bg-red-500/5 border-red-500/20" : "bg-primary/5 border-primary/20")}>
          <div className="flex items-start gap-2">
            {nps_categoria === "detrator" ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /> : <Star className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
            <p className="text-xs">{recomendacao}</p>
          </div>
        </div>
      )}
    </div>
  );
}
