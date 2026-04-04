import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Cake, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BirthdayItem {
  nome: string;
  date: Date;
  type: "cliente" | "empresa";
  gestor: string | null;
  daysUntil: number;
}

export function BirthdayAlerts() {
  const [items, setItems] = useState<BirthdayItem[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("whatsapp_grupos")
        .select("nome, aniversario_cliente, aniversario_empresa, gestor_responsavel");
      if (!data) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentYear = today.getFullYear();
      const result: BirthdayItem[] = [];

      for (const g of data) {
        if (g.aniversario_cliente) {
          const d = parseISO(g.aniversario_cliente);
          let thisYear = new Date(currentYear, d.getMonth(), d.getDate());
          if (thisYear < today) thisYear = new Date(currentYear + 1, d.getMonth(), d.getDate());
          const daysUntil = differenceInDays(thisYear, today);
          if (daysUntil <= 30) {
            result.push({ nome: g.nome, date: thisYear, type: "cliente", gestor: g.gestor_responsavel, daysUntil });
          }
        }
        if (g.aniversario_empresa) {
          const d = parseISO(g.aniversario_empresa);
          let thisYear = new Date(currentYear, d.getMonth(), d.getDate());
          if (thisYear < today) thisYear = new Date(currentYear + 1, d.getMonth(), d.getDate());
          const daysUntil = differenceInDays(thisYear, today);
          if (daysUntil <= 30) {
            result.push({ nome: g.nome, date: thisYear, type: "empresa", gestor: g.gestor_responsavel, daysUntil });
          }
        }
      }

      result.sort((a, b) => a.daysUntil - b.daysUntil);
      setItems(result);
    };
    load();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="bg-card/60 border border-border/30 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Cake className="w-4 h-4 text-pink-500" />
        <h3 className="text-sm font-semibold">Aniversários Próximos</h3>
        <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
      </div>
      <ScrollArea className="max-h-[200px]">
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={`${item.type}-${item.nome}-${i}`} className="flex items-center gap-2 text-xs">
              {item.type === "cliente" ? (
                <Cake className="w-3.5 h-3.5 text-pink-500 shrink-0" />
              ) : (
                <Building2 className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.nome}</p>
                <p className="text-muted-foreground">
                  {format(item.date, "dd/MM", { locale: ptBR })}
                  {item.gestor && ` · ${item.gestor}`}
                </p>
              </div>
              <Badge
                variant={item.daysUntil === 0 ? "default" : "outline"}
                className={`text-[10px] shrink-0 ${item.daysUntil === 0 ? "bg-pink-500" : ""}`}
              >
                {item.daysUntil === 0 ? "HOJE!" : `${item.daysUntil}d`}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
