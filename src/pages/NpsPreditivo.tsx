import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useNpsPredictions } from "@/hooks/useNpsPredictions";
import { useClientData } from "@/hooks/useClientData";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { NpsDetailPanel } from "@/components/NpsDetailPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Heart, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { NpsPrediction } from "@/types/client";
import newvoxLogo from "@/assets/newvox-logo.jpg";

export default function NpsPreditivo() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isAdmin, loading: profileLoading } = useProfile();
  const { allGrupos } = useClientData();
  const { predictions, predictionsMap, npsGlobal, promotores, neutros, detratores, loading } = useNpsPredictions();
  const [selectedPrediction, setSelectedPrediction] = useState<NpsPrediction | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [calculating, setCalculating] = useState(false);

  // Redirect non-admin
  useEffect(() => {
    if (!profileLoading && !isAdmin) navigate("/");
  }, [profileLoading, isAdmin, navigate]);

  // Fetch history for chart
  useEffect(() => {
    supabase.from("nps_prediction_history")
      .select("nps_score, nps_categoria, recorded_at")
      .order("recorded_at", { ascending: true })
      .then(({ data }) => {
        if (data) {
          // Group by date (day) and average
          const byDate: Record<string, { scores: number[]; date: string }> = {};
          for (const h of data) {
            const date = new Date(h.recorded_at).toLocaleDateString("pt-BR");
            if (!byDate[date]) byDate[date] = { scores: [], date };
            byDate[date].scores.push(Number(h.nps_score));
          }
          setHistory(Object.values(byDate).map(d => ({
            date: d.date,
            nps: Number((d.scores.reduce((s, v) => s + v, 0) / d.scores.length).toFixed(1)),
          })).slice(-28));
        }
      });
  }, [predictions]);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      await supabase.functions.invoke("calculate-nps-predictions");
    } catch (_) {}
    setCalculating(false);
  };

  const sortedPredictions = useMemo(() =>
    [...predictions].sort((a, b) => a.nps_score - b.nps_score),
    [predictions]
  );

  const npsColor = npsGlobal > 50 ? "text-emerald-500" : npsGlobal >= 0 ? "text-amber-500" : "text-red-500";

  if (profileLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="p-2 rounded-md hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
            <img src={newvoxLogo} alt="New Vox" className="w-8 h-8 rounded object-cover" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">NPS Preditivo</h1>
              <p className="text-xs text-muted-foreground">Satisfação estimada sem enviar pesquisa</p>
            </div>
          </div>
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {calculating ? "Calculando..." : "Recalcular NPS"}
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Global Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Heart className={cn("w-8 h-8", npsColor)} />
              <div>
                <p className={cn("text-2xl font-black", npsColor)}>{npsGlobal > 0 ? "+" : ""}{npsGlobal}</p>
                <p className="text-[10px] text-muted-foreground">NPS Global</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-black text-emerald-500">{promotores}</p>
                <p className="text-[10px] text-muted-foreground">Promotores</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Minus className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-black text-amber-500">{neutros}</p>
                <p className="text-[10px] text-muted-foreground">Neutros</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-black text-red-500">{detratores}</p>
                <p className="text-[10px] text-muted-foreground">Detratores</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-black">{predictions.length}</p>
                <p className="text-[10px] text-muted-foreground">Total Avaliados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Distribution Bar */}
        {predictions.length > 0 && (
          <div className="p-4 rounded-lg bg-card/60 border border-border/30">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Distribuição NPS</p>
            <div className="flex h-4 rounded-full overflow-hidden">
              {promotores > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(promotores / predictions.length) * 100}%` }} />}
              {neutros > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(neutros / predictions.length) * 100}%` }} />}
              {detratores > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(detratores / predictions.length) * 100}%` }} />}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Promotores {Math.round((promotores / predictions.length) * 100)}%</span>
              <span>Neutros {Math.round((neutros / predictions.length) * 100)}%</span>
              <span>Detratores {Math.round((detratores / predictions.length) * 100)}%</span>
            </div>
          </div>
        )}

        {/* Chart */}
        {history.length > 1 && (
          <div className="p-4 rounded-lg bg-card/60 border border-border/30">
            <p className="text-xs text-muted-foreground mb-3 font-medium">Evolução do NPS Médio</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Line type="monotone" dataKey="nps" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Client List */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Todos os Clientes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedPredictions.map(pred => {
              const grupo = allGrupos.find(g => g.group_id === pred.group_id);
              const catColors = {
                promotor: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-500" },
                neutro: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-500" },
                detrator: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-500" },
              };
              const c = catColors[pred.nps_categoria];

              return (
                <Card
                  key={pred.group_id}
                  className={cn("cursor-pointer hover:scale-[1.02] transition-all border", c.border, c.bg)}
                  onClick={() => setSelectedPrediction(pred)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold truncate flex-1">{grupo?.nome || pred.group_id}</p>
                      <span className={cn("text-xl font-black", c.text)}>{pred.nps_score.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[10px]", c.bg, c.text, c.border)}>
                        {pred.nps_categoria === "promotor" ? "Promotor" : pred.nps_categoria === "neutro" ? "Neutro" : "Detrator"}
                      </Badge>
                      <div className="flex items-center gap-1 text-[10px]">
                        {pred.tendencia === "subindo" && <ArrowUp className="w-3 h-3 text-emerald-500" />}
                        {pred.tendencia === "caindo" && <ArrowDown className="w-3 h-3 text-red-500" />}
                        {pred.tendencia === "estavel" && <Minus className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-auto">Conf: {pred.confianca}%</span>
                    </div>
                    {pred.fator_principal && (
                      <p className="text-[10px] text-muted-foreground mt-2 truncate">{pred.fator_principal}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      <Dialog open={!!selectedPrediction} onOpenChange={() => setSelectedPrediction(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              NPS Preditivo — {allGrupos.find(g => g.group_id === selectedPrediction?.group_id)?.nome || selectedPrediction?.group_id}
            </DialogTitle>
          </DialogHeader>
          <NpsDetailPanel prediction={selectedPrediction || undefined} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
