import { useState, useEffect, useCallback } from "react";
import { Grupo } from "@/types/client";
import { ClientCard } from "./ClientCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Monitor, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  grupos: Grupo[];
  onSelectGrupo: (g: Grupo) => void;
}

export function TVModeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5 text-xs">
      <Monitor className="w-3.5 h-3.5" />
      Modo TV
    </Button>
  );
}

export function TVModeOverlay({ grupos, onSelectGrupo, onClose }: Props & { onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-8 py-4 border-b border-border/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Monitor className="w-6 h-6" />
            <span className="text-lg font-bold tracking-wide">CENTRAL DE OPERAÇÕES</span>
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

      <div className="flex-1 overflow-auto p-8">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-5 h-5" />
          <h2 className="text-2xl font-bold">Todos os Grupos</h2>
          <Badge variant="secondary" className="text-xs">
            {grupos.length} grupos
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {grupos.map((g) => (
            <ClientCard key={g.id} grupo={g} onClick={onSelectGrupo} compact />
          ))}
        </div>
      </div>
    </div>
  );
}
