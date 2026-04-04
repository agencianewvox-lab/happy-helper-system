import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Star, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NpsSurveyRow {
  id: string;
  group_id: string;
  score: number;
  comment: string | null;
  survey_type: string;
  created_at: string;
  quality_rating: string | null;
  results_rating: string | null;
  communication_rating: string | null;
  manager_rating: string | null;
  improvement_comment: string | null;
  respondent_name: string | null;
}

interface GrupoInfo {
  group_id: string;
  nome: string;
  gestor_responsavel: string | null;
  categoria: string | null;
}

export default function NpsReal() {
  const [surveys, setSurveys] = useState<NpsSurveyRow[]>([]);
  const [grupos, setGrupos] = useState<GrupoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const [surveyRes, gruposRes] = await Promise.all([
        supabase.from("nps_surveys").select("*").order("created_at", { ascending: false }),
        supabase.from("whatsapp_grupos").select("group_id, nome, gestor_responsavel, categoria"),
      ]);
      if (surveyRes.data) setSurveys(surveyRes.data as NpsSurveyRow[]);
      if (gruposRes.data) setGrupos(gruposRes.data as GrupoInfo[]);
      setLoading(false);
    }
    fetch();
  }, []);

  const gruposMap = useMemo(() => {
    const map: Record<string, GrupoInfo> = {};
    for (const g of grupos) map[g.group_id] = g;
    return map;
  }, [grupos]);

  const filtered = useMemo(() => {
    return surveys.filter((s) => {
      const grupo = gruposMap[s.group_id];
      const nome = grupo?.nome || s.group_id;
      const gestor = grupo?.gestor_responsavel || "";
      const matchSearch =
        nome.toLowerCase().includes(search.toLowerCase()) ||
        gestor.toLowerCase().includes(search.toLowerCase()) ||
        (s.comment || "").toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || s.survey_type === filterType;
      return matchSearch && matchType;
    });
  }, [surveys, search, filterType, gruposMap]);

  const stats = useMemo(() => {
    if (surveys.length === 0) return { avg: 0, promoters: 0, detractors: 0, passive: 0, nps: 0, total: 0 };
    const total = surveys.length;
    const avg = surveys.reduce((s, sv) => s + sv.score, 0) / total;
    const promoters = surveys.filter((s) => s.score >= 9).length;
    const detractors = surveys.filter((s) => s.score <= 6).length;
    const passive = total - promoters - detractors;
    const nps = Math.round(((promoters - detractors) / total) * 100);
    return { avg: Number(avg.toFixed(1)), promoters, detractors, passive, nps, total };
  }, [surveys]);

  function getScoreColor(score: number) {
    if (score >= 9) return "text-green-400";
    if (score >= 7) return "text-yellow-400";
    return "text-red-400";
  }

  function getScoreBadge(score: number) {
    if (score >= 9) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Promotor</Badge>;
    if (score >= 7) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Neutro</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Detrator</Badge>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NPS Real</h1>
        <p className="text-muted-foreground text-sm">Todas as respostas das pesquisas de satisfação</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Respostas</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Média</p>
            <p className={`text-2xl font-bold ${getScoreColor(stats.avg)}`}>{stats.avg}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">NPS Score</p>
            <p className={`text-2xl font-bold ${stats.nps >= 50 ? "text-green-400" : stats.nps >= 0 ? "text-yellow-400" : "text-red-400"}`}>
              {stats.nps}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Promotores</p>
            <p className="text-2xl font-bold text-green-400">{stats.promoters}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Detratores</p>
            <p className="text-2xl font-bold text-red-400">{stats.detractors}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, gestor ou comentário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="operacao">Operação</SelectItem>
            <SelectItem value="clinica">Clínica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-card border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma resposta encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => {
                  const grupo = gruposMap[s.group_id];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-foreground">
                        {grupo?.nome?.replace(/\s*\(.*?\)/, "").substring(0, 25) || s.group_id.substring(0, 12)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {grupo?.gestor_responsavel || "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-lg font-bold ${getScoreColor(s.score)}`}>{s.score}</span>
                      </TableCell>
                      <TableCell>{getScoreBadge(s.score)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {s.survey_type === "clinica" ? "Clínica" : "Operação"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">
                        {s.comment || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
