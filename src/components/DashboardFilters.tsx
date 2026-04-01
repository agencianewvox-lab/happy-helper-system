import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

interface Props {
  categorias: string[];
  activeFilter: string | null;
  onFilterChange: (cat: string | null) => void;
  onPriorityFilter?: () => void;
  isPriorityActive?: boolean;
}

const categoriaIcons: Record<string, string> = {
  "Clientes / Operação": "🚗",
  "Clínicas": "🦷",
  "Internos / Gestão": "🧠",
};

export function DashboardFilters({ categorias, activeFilter, onFilterChange, onPriorityFilter, isPriorityActive }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={activeFilter === null && !isPriorityActive ? "default" : "outline"}
        size="sm"
        onClick={() => onFilterChange(null)}
        className="text-xs gap-1.5"
      >
        Todos
      </Button>
      {onPriorityFilter && (
        <Button
          variant={isPriorityActive ? "default" : "outline"}
          size="sm"
          onClick={onPriorityFilter}
          className={cn("text-xs gap-1.5", isPriorityActive && "bg-red-600 hover:bg-red-700 text-white")}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Prioridade Máxima
        </Button>
      )}
      {categorias.map((cat) => (
        <Button
          key={cat}
          variant={activeFilter === cat ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(cat)}
          className="text-xs gap-1.5"
        >
          {categoriaIcons[cat] || "📁"} {cat}
        </Button>
      ))}
    </div>
  );
}
