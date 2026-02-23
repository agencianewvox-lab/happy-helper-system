import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  categorias: string[];
  activeFilter: string | null;
  onFilterChange: (cat: string | null) => void;
}

const categoriaIcons: Record<string, string> = {
  "Clientes / Operação": "🚗",
  "Clínicas": "🦷",
  "Internos / Gestão": "🧠",
};

export function DashboardFilters({ categorias, activeFilter, onFilterChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={activeFilter === null ? "default" : "outline"}
        size="sm"
        onClick={() => onFilterChange(null)}
        className="text-xs gap-1.5"
      >
        Todos
      </Button>
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
