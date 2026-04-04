import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { NpsPrediction } from "@/types/client";

interface NpsScoreBadgeProps {
  prediction: NpsPrediction | undefined;
}

export function NpsScoreBadge({ prediction }: NpsScoreBadgeProps) {
  if (!prediction) return null;

  const { nps_score, nps_categoria, confianca, tendencia } = prediction;

  if (confianca < 20) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title="Dados insuficientes para NPS">
        NPS ?
      </span>
    );
  }

  const colorMap = {
    promotor: { bg: "bg-emerald-500/15", text: "text-emerald-500" },
    neutro: { bg: "bg-amber-500/15", text: "text-amber-500" },
    detrator: { bg: "bg-red-500/15", text: "text-red-500" },
  };
  const colors = colorMap[nps_categoria];

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full", colors.bg, colors.text)}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-current/10">
        {nps_score.toFixed(1)}
      </span>
      <span className="text-[9px] text-muted-foreground">NPS</span>
      {tendencia === "subindo" && <ArrowUp className="w-2.5 h-2.5 text-emerald-500" />}
      {tendencia === "caindo" && <ArrowDown className="w-2.5 h-2.5 text-red-500" />}
      {tendencia === "estavel" && <Minus className="w-2.5 h-2.5 text-muted-foreground" />}
    </span>
  );
}
