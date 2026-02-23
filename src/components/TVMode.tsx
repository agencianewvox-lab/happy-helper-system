import { useState, useEffect, useCallback } from "react";
import { Cliente } from "@/types/client";
import { ClientCard } from "./ClientCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Monitor, X, Star, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  clientes: Cliente[];
  onSelectClient: (c: Cliente) => void;
}

const ROTATION_INTERVAL = 15000;

type TVView = "overview" | "ranking" | "risk";

const viewConfig: { key: TVView; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Visão Geral", icon: <Users className="w-5 h-5" /> },
  { key: "ranking", label: "Ranking por Nota", icon: <Star className="w-5 h-5" /> },
  { key: "risk", label: "Clientes em Risco", icon: <AlertTriangle className="w-5 h-5" /> },
];

export function TVModeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5 text-xs">
      <Monitor className="w-3.5 h-3.5" />
      Modo TV
    </Button>
  );
}

export function TVModeOverlay({ clientes, onSelectClient, onClose }: Props & { onClose: () => void }) {
  const [currentView, setCurrentView] = useState<TVView>("overview");

  const rotateView = useCallback(() => {
    setCurrentView((prev) => {
      const idx = viewConfig.findIndex((v) => v.key === prev);
      return viewConfig[(idx + 1) % viewConfig.length].key;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(rotateView, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [rotateView]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const ranked = [...clientes].sort((a, b) => b.nota_gestor - a.nota_gestor);
  const atRisk = clientes.filter(
    (c) => c.risco_churn === "medio" || c.risco_churn === "alto" || c.conversas_iniciadas === 0
  );

  const currentConfig = viewConfig.find((v) => v.key === currentView)!;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Monitor className="w-6 h-6" />
            <span className="text-lg font-bold tracking-wide">CENTRAL DE OPERAÇÕES</span>
          </div>
          <div className="flex gap-1">
            {viewConfig.map((v) => (
              <button
                key={v.key}
                onClick={() => setCurrentView(v.key)}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  currentView === v.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            AO VIVO
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="flex items-center gap-3 mb-6">
          {currentConfig.icon}
          <h2 className="text-2xl font-bold">{currentConfig.label}</h2>
          <Badge variant="secondary" className="text-xs">
            {currentView === "risk" ? atRisk.length : clientes.length} clientes
          </Badge>
        </div>

        {currentView === "overview" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {clientes.map((c) => (
              <ClientCard key={c.id} cliente={c} onClick={onSelectClient} compact />
            ))}
          </div>
        )}

        {currentView === "ranking" && (
          <div className="space-y-3 max-w-4xl">
            {ranked.map((c, i) => (
              <div
                key={c.id}
                onClick={() => onSelectClient(c)}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-lg border border-border/30 cursor-pointer transition-colors hover:bg-muted/30",
                  i < 3 && "border-amber-500/30"
                )}
              >
                <span className={cn(
                  "text-2xl font-black w-10 text-center",
                  i === 0 && "text-amber-400",
                  i === 1 && "text-gray-400",
                  i === 2 && "text-amber-700"
                )}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-lg">{c.nome}</p>
                  <p className="text-sm text-muted-foreground truncate">{c.sentimento}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black">{c.nota_gestor}</p>
                  <p className="text-xs text-muted-foreground">/10</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentView === "risk" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {atRisk.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-12 text-lg">
                Nenhum cliente em risco 🎉
              </p>
            ) : (
              atRisk.map((c) => (
                <ClientCard key={c.id} cliente={c} onClick={onSelectClient} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
