import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, DollarSign, Eye, MousePointerClick,
  TrendingUp, Target, BarChart3, RefreshCw, Search, X, CalendarIcon
} from "lucide-react";
import {
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart,
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

interface AdAccount {
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  business_name?: string;
}

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "Ativa", color: "text-emerald-500" },
  2: { label: "Desativada", color: "text-muted-foreground" },
  3: { label: "Não segura", color: "text-red-500" },
};

export function MetaAdsTab({ grupoId, grupoDbId }: MetaAdsTabProps) {
  const [savedAccountId, setSavedAccountId] = useState("");
  const [savedAccountName, setSavedAccountName] = useState("");
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [summary, setSummary] = useState<AdsSummary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [customSince, setCustomSince] = useState<Date | undefined>(undefined);
  const [customUntil, setCustomUntil] = useState<Date | undefined>(undefined);
  const [useCustomRange, setUseCustomRange] = useState(false);

  // Fetch saved ad_account_id
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whatsapp_grupos")
        .select("ad_account_id")
        .eq("id", grupoDbId)
        .single();
      if (data && (data as any).ad_account_id) {
        setSavedAccountId((data as any).ad_account_id);
      }
    })();
  }, [grupoDbId]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("meta-ads", {
        body: { action: "list_accounts" },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setAccounts(data.accounts || []);
      setAccountsLoaded(true);
    } catch (err: any) {
      setAccountsError(err.message || "Erro ao listar contas");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountsLoaded) loadAccounts();
  }, [accountsLoaded, loadAccounts]);

  useEffect(() => {
    if (savedAccountId && accounts.length > 0) {
      const found = accounts.find((a) => a.account_id === savedAccountId || `act_${a.account_id}` === savedAccountId);
      if (found) setSavedAccountName(found.name || found.account_id);
    }
  }, [savedAccountId, accounts]);

  const selectAccount = useCallback(async (account: AdAccount) => {
    setSaving(true);
    const id = account.account_id;
    await supabase
      .from("whatsapp_grupos")
      .update({ ad_account_id: id } as any)
      .eq("id", grupoDbId);
    setSavedAccountId(id);
    setSavedAccountName(account.name || id);
    setSaving(false);
  }, [grupoDbId]);

  const disconnectAccount = useCallback(async () => {
    setSaving(true);
    await supabase
      .from("whatsapp_grupos")
      .update({ ad_account_id: null } as any)
      .eq("id", grupoDbId);
    setSavedAccountId("");
    setSavedAccountName("");
    setSummary(null);
    setCampaigns([]);
    setDaily([]);
    setSaving(false);
  }, [grupoDbId]);

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

  const filteredAccounts = useMemo(() => {
    if (!searchQuery) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter((a) =>
      (a.name || "").toLowerCase().includes(q) ||
      a.account_id.includes(q) ||
      (a.business_name || "").toLowerCase().includes(q)
    );
  }, [accounts, searchQuery]);

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const fmtMoney = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Account Selector */}
      {!savedAccountId ? (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-3">
          <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            Selecione a Conta de Anúncios
          </Label>

          {accountsLoading && (
            <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando contas disponíveis...
            </div>
          )}

          {accountsError && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between">
              <span>{accountsError}</span>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={loadAccounts}>Tentar novamente</Button>
            </div>
          )}

          {accountsLoaded && accounts.length > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nome ou ID..."
                  className="h-8 text-sm bg-background/50 pl-8"
                />
              </div>
              <ScrollArea className="max-h-[250px]">
                <div className="space-y-1.5">
                  {filteredAccounts.map((acc) => {
                    const status = STATUS_MAP[acc.account_status] || { label: `Status ${acc.account_status}`, color: "text-muted-foreground" };
                    return (
                      <button
                        key={acc.account_id}
                        onClick={() => selectAccount(acc)}
                        disabled={saving}
                        className="w-full text-left p-2.5 rounded-lg border border-border/20 bg-background/50 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{acc.name || acc.account_id}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span>ID: {acc.account_id}</span>
                            {acc.business_name && <span>• {acc.business_name}</span>}
                            <span>• {acc.currency}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-[9px] shrink-0", status.color)}>
                          {status.label}
                        </Badge>
                      </button>
                    );
                  })}
                  {filteredAccounts.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conta encontrada.</p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {accountsLoaded && accounts.length === 0 && !accountsError && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma conta de anúncios encontrada para este token.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <BarChart3 className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{savedAccountName || savedAccountId}</p>
            <p className="text-[10px] text-muted-foreground">ID: {savedAccountId}</p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive" onClick={disconnectAccount} disabled={saving}>
            <X className="w-3 h-3" /> Desconectar
          </Button>
        </div>
      )}

      {savedAccountId && (
        <>
          {/* Period selector + refresh */}
          <div className="flex items-center gap-2 flex-wrap">
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
