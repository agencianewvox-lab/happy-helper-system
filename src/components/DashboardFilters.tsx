import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, MessageSquareOff, ThumbsUp } from "lucide-react";

export type FilterType = "todos" | "em_risco" | "sem_conversas" | "positivo" | "neutro" | "negativo";

interface Props {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

const filters: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: "todos", label: "Todos", icon: null },
  { key: "em_risco", label: "Em Risco", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { key: "sem_conversas", label: "Sem Conversas", icon: <MessageSquareOff className="w-3.5 h-3.5" /> },
  { key: "positivo", label: "Positivo", icon: <ThumbsUp className="w-3.5 h-3.5" /> },
  { key: "neutro", label: "Neutro", icon: null },
  { key: "negativo", label: "Negativo", icon: null },
];

export function DashboardFilters({ activeFilter, onFilterChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map(({ key, label, icon }) => (
        <Button
          key={key}
          variant={activeFilter === key ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(key)}
          className={cn(
            "text-xs gap-1.5",
            activeFilter === key && key === "em_risco" && "bg-red-600 hover:bg-red-700",
            activeFilter === key && key === "positivo" && "bg-emerald-600 hover:bg-emerald-700",
            activeFilter === key && key === "negativo" && "bg-red-600 hover:bg-red-700",
            activeFilter === key && key === "neutro" && "bg-amber-600 hover:bg-amber-700"
          )}
        >
          {icon}
          {label}
        </Button>
      ))}
    </div>
  );
}
