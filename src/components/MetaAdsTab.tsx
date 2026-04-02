import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Save, Loader2, CheckCircle2, DollarSign, Eye, MousePointerClick,
  TrendingUp, Target, BarChart3, RefreshCw
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart,
} from "recharts";

interface MetaAdsTabProps {
  grupoId: string;
  grupoDbId: string;
}

interface AdsSummary {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  leads: number;
  purchases: number;
  conversions: number;
  cpa: number | null;
}

interface Campaign {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
}

interface DailyData {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export function MetaAdsTab({ grupoId, grupoDbId }: MetaAdsTabProps) {
  const [adAccountId, setAdAccountId] = useState("");
  const [savedAccountId, setSavedAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [summary, setSummary] = useState<AdsSummary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState("last_30d");

  // Fetch saved ad_account_id
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whatsapp_grupos")
        .select("ad_account_id")
        .eq("id", grupoDbId)
        .single();
      if (data && (data as any).ad_account_id) {
        const id = (data as any).ad_account_id;
        setAdAccountId(id);
        setSavedAccountId(id);
      }
    })();
  }, [grupoDbId]);

  const saveAccount = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("whatsapp_grupos")
      .update({ ad_account_id: adAccountId || null } as any)
      .eq("id", grupoDbId);
    setSavedAccountId(adAccountId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [adAccountId, grupoDbId]);

  const fetchAds = useCallback(async () => {
    if (!savedAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("meta-ads", {
        body: { ad_account_id: savedAccountId, date_preset: datePreset },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary);
      setCampaigns(data.campaigns || []);
      setDaily(data.daily || []);
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Meta Ads");
    } finally {
      setLoading(false);
    }
  }, [savedAccountId, datePreset]);

  useEffect(() => {
    if (savedAccountId) fetchAds();
  }, [savedAccountId, fetchAds]);

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const fmtMoney = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Account ID Config */}
      <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
        <Label className="text-xs text-muted-foreground font-medium">ID da Conta de Anúncios (Meta)</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            placeholder="Ex: 123456789 ou act_123456789"
            className="h-8 text-sm bg-background/50 flex-1"
          />
          <Button size="sm" className="h-8 gap-1" onClick={saveAccount} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Save className="w-3 h-3" />}
            {saved ? "Salvo" : "Salvar"}
          </Button>
        </div>
      </div>

      {!savedAccountId && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Configure o ID da conta de anúncios acima para ver os dados do Meta Ads.
        </p>
      )}

      {savedAccountId && (
        <>
          {/* Period selector + refresh */}
          <div className="flex items-center gap-2">
            {["last_7d", "last_14d", "last_30d", "this_month", "last_month"].map((p) => (
              <Badge
                key={p}
                variant={datePreset === p ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => setDatePreset(p)}
              >
                {p === "last_7d" ? "7 dias" : p === "last_14d" ? "14 dias" : p === "last_30d" ? "30 dias" : p === "this_month" ? "Este mês" : "Mês passado"}
              </Badge>
            ))}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto" onClick={fetchAds} disabled={loading}>
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {error}
            </div>
          )}

          {loading && !summary && (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados...
            </div>
          )}

          {summary && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Investimento", value: fmtMoney(summary.spend), icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                  { label: "Impressões", value: fmt(summary.impressions), icon: Eye, color: "text-blue-500", bg: "bg-blue-500/10" },
                  { label: "Cliques", value: fmt(summary.clicks), icon: MousePointerClick, color: "text-amber-500", bg: "bg-amber-500/10" },
                  { label: "CTR", value: `${summary.ctr.toFixed(2)}%`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
                  { label: "CPC", value: fmtMoney(summary.cpc), icon: MousePointerClick, color: "text-orange-500", bg: "bg-orange-500/10" },
                  { label: "CPM", value: fmtMoney(summary.cpm), icon: BarChart3, color: "text-violet-500", bg: "bg-violet-500/10" },
                  { label: "Alcance", value: fmt(summary.reach), icon: Target, color: "text-cyan-500", bg: "bg-cyan-500/10" },
                  { label: "CPA", value: summary.cpa ? fmtMoney(summary.cpa) : "—", icon: DollarSign, color: "text-red-500", bg: "bg-red-500/10" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={cn("p-2.5 rounded-lg border border-border/30", bg)}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={cn("w-3.5 h-3.5", color)} />
                      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                    </div>
                    <p className="text-sm font-bold">{value}</p>
                  </div>
                ))}
              </div>

              {/* Daily Chart */}
              {daily.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground font-semibold mb-2">📊 Investimento Diário</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />
                      <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v) => `R$${v}`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        formatter={(value: number, name: string) => [name === "spend" ? fmtMoney(value) : fmt(value), name === "spend" ? "Invest." : name === "clicks" ? "Cliques" : "Leads"]}
                        labelFormatter={(d) => new Date(d).toLocaleDateString("pt-BR")}
                      />
                      <Bar yAxisId="left" dataKey="spend" fill="hsl(var(--primary))" opacity={0.7} radius={[2, 2, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Campaign Breakdown */}
              {campaigns.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground font-semibold mb-2">🎯 Campanhas</p>
                  <div className="space-y-1.5">
                    {campaigns.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-background/50 border border-border/20">
                        <span className="truncate flex-1 font-medium">{c.name}</span>
                        <div className="flex gap-3 text-muted-foreground shrink-0 ml-2">
                          <span>{fmtMoney(c.spend)}</span>
                          <span>{fmt(c.clicks)} cliques</span>
                          <span>{c.ctr.toFixed(2)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
